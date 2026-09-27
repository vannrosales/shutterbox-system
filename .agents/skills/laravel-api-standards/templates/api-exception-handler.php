<?php

declare(strict_types=1);

/*
 * Central API exception rendering.
 *
 * Paste into the ->withExceptions() closure in bootstrap/app.php.
 *
 * The point: ONE error shape for every endpoint. Per-controller error handling
 * guarantees drift, and every client then writes bespoke parsing for each
 * endpoint's quirks.
 *
 * Contract:
 *   message     human-readable, translated, safe to display
 *   errors      field-keyed, 422 only
 *   error_code  STABLE machine-readable string — clients branch on THIS, never `message`
 *   request_id  correlates with your logs; the single most useful support field
 */

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Symfony\Component\Routing\Exception\RouteNotFoundException;

return function (Exceptions $exceptions): void {

    /** Build the envelope. Nothing else constructs an error response. */
    $render = function (
        string $message,
        string $errorCode,
        int $status,
        array $errors = [],
        array $headers = [],
    ) {
        return response()->json(array_filter([
            'message'    => $message,
            'errors'     => $errors ?: null,
            'error_code' => $errorCode,
            'request_id' => Context::get('request_id'),
        ], fn (mixed $v): bool => $v !== null), $status, $headers);
    };

    $isApi = fn (Request $request): bool =>
        $request->is('api/*') || $request->expectsJson();

    // ── 422 Validation ──────────────────────────────────────────────────────
    $exceptions->render(function (ValidationException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;                    // let the web handler redirect back
        }

        return $render(
            $e->getMessage(),
            'validation_failed',
            422,
            $e->errors(),
        );
    });

    // ── 401 Unauthenticated ─────────────────────────────────────────────────
    $exceptions->render(function (AuthenticationException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        return $render(__('Unauthenticated.'), 'unauthenticated', 401);
    });

    // ── 403 Authorization ───────────────────────────────────────────────────
    $exceptions->render(function (AuthorizationException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        // Response::denyAsNotFound() sets the status to 404 — honour it. Returning
        // 403 for another tenant's record CONFIRMS the record exists, which is an
        // enumeration oracle. See laravel-security.
        $status = $e->response()?->status() ?? 403;

        return $render(
            $status === 404 ? __('Resource not found.') : ($e->getMessage() ?: __('This action is unauthorized.')),
            $status === 404 ? 'not_found' : 'forbidden',
            $status,
        );
    });

    // ── 404 Model / route not found ─────────────────────────────────────────
    $exceptions->render(function (ModelNotFoundException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        // Never echo the model class back — it leaks internal structure.
        return $render(__('Resource not found.'), 'not_found', 404);
    });

    $exceptions->render(function (NotFoundHttpException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        return $render(__('Endpoint not found.'), 'endpoint_not_found', 404);
    });

    // ── 405 Method not allowed ──────────────────────────────────────────────
    $exceptions->render(function (MethodNotAllowedHttpException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        return $render(
            __('The :method method is not supported for this endpoint.', ['method' => $request->method()]),
            'method_not_allowed',
            405,
            headers: ['Allow' => $e->getHeaders()['Allow'] ?? ''],
        );
    });

    // ── 419 CSRF (SPA cookie flow) ──────────────────────────────────────────
    $exceptions->render(function (TokenMismatchException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        return $render(__('CSRF token mismatch.'), 'csrf_mismatch', 419);
    });

    // ── 429 Rate limited ────────────────────────────────────────────────────
    $exceptions->render(function (TooManyRequestsHttpException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        return $render(
            __('Too many requests. Please slow down.'),
            'rate_limited',
            429,
            headers: array_filter(['Retry-After' => $e->getHeaders()['Retry-After'] ?? null]),
        );
    });

    // ── Domain exceptions — map each to a stable code ───────────────────────
    // Every entry here must also appear in the error-code table in your docs.
    $exceptions->render(function (\App\Exceptions\DomainException $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        return $render($e->getMessage(), $e->errorCode(), $e->status());
    });

    // ── Catch-all ───────────────────────────────────────────────────────────
    $exceptions->render(function (\Throwable $e, Request $request) use ($render, $isApi) {
        if (! $isApi($request)) {
            return null;
        }

        // HttpExceptions already carry a deliberate status.
        if ($e instanceof HttpException) {
            return $render(
                $e->getMessage() ?: __('Request failed.'),
                'http_error',
                $e->getStatusCode(),
                headers: $e->getHeaders(),
            );
        }

        Log::error('Unhandled API exception', [
            'exception'  => $e::class,
            'message'    => $e->getMessage(),
            'route'      => $request->route()?->getName(),
            'user'       => $request->user()?->id,
            'request_id' => Context::get('request_id'),
        ]);

        // NEVER leak internals in production. In local/testing, let Laravel's
        // default handler through so debugging still works.
        if (! app()->isProduction()) {
            return null;
        }

        return $render(__('An unexpected error occurred.'), 'server_error', 500);
    });

    // ── Never flash or report credentials ───────────────────────────────────
    $exceptions->dontFlash([
        'current_password', 'password', 'password_confirmation', 'token', 'secret',
    ]);
};

/* ─────────────────────────────────────────────────────────────────────────────
   Domain exception base class — app/Exceptions/DomainException.php

   abstract class DomainException extends \RuntimeException
   {
       abstract public function errorCode(): string;

       public function status(): int
       {
           return 422;
       }
   }

   final class InvoiceAlreadyPaid extends DomainException
   {
       public function __construct(public readonly Invoice $invoice)
       {
           parent::__construct(__('This invoice has already been paid.'));
       }

       public function errorCode(): string { return 'invoice_already_paid'; }
       public function status(): int       { return 409; }
   }

   This is what lets an Action throw a domain exception and stay free of HTTP
   concerns — see laravel-enterprise-architecture.

   ─────────────────────────────────────────────────────────────────────────────
   Force JSON on API routes, or a client that omits `Accept: application/json`
   gets an HTML redirect instead of a 422 — which surfaces as "the API returns HTML".

   final class ForceJsonResponse
   {
       public function handle(Request $request, Closure $next): Response
       {
           $request->headers->set('Accept', 'application/json');
           return $next($request);
       }
   }

   ─────────────────────────────────────────────────────────────────────────────
   Request id — assign early so it reaches every log line and queued job.

   final class AssignRequestId
   {
       public function handle(Request $request, Closure $next): Response
       {
           $id = $request->header('X-Request-Id') ?: (string) Str::ulid();
           Context::add('request_id', $id);

           return tap($next($request), fn ($r) => $r->headers->set('X-Request-Id', $id));
       }
   }

   ─────────────────────────────────────────────────────────────────────────────
   Test the contract:

   it('returns the standard error envelope', function (): void {
       $this->postJson('/api/v1/invoices', [])
           ->assertUnprocessable()
           ->assertJsonStructure(['message', 'errors', 'error_code', 'request_id'])
           ->assertJsonPath('error_code', 'validation_failed');
   });

   it('does not leak internals on a server error', function (): void {
       // force a 500 in a production-like config
       $this->getJson('/api/v1/boom')
           ->assertStatus(500)
           ->assertJsonPath('error_code', 'server_error')
           ->assertJsonMissingPath('exception')
           ->assertJsonMissingPath('trace');
   });
   ───────────────────────────────────────────────────────────────────────────── */
