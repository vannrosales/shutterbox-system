# Worked example: one feature across every layer

Feature: *a team owner invites a member by email; the invitee accepts via a signed link.*

This shows the full vertical slice and the file layout an enterprise feature produces.

## Files

```
app/
├── Actions/Teams/
│   ├── InviteTeamMember.php
│   └── AcceptTeamInvitation.php
├── DataTransferObjects/InviteTeamMemberData.php
├── Enums/TeamRole.php
├── Events/TeamMemberInvited.php
├── Exceptions/Teams/AlreadyAMember.php
├── Http/
│   ├── Controllers/Teams/{InviteTeamMemberController,AcceptInvitationController}.php
│   ├── Requests/InviteTeamMemberRequest.php
│   └── Resources/TeamInvitationResource.php
├── Listeners/SendTeamInvitationMail.php
├── Models/{Team,TeamInvitation}.php
├── Notifications/TeamInvitationSent.php
├── Policies/TeamPolicy.php
└── Rules/NotAlreadyInvited.php
database/
├── factories/TeamInvitationFactory.php
└── migrations/2026_07_31_000000_create_team_invitations_table.php
tests/Feature/Teams/{InviteTeamMemberTest,AcceptInvitationTest}.php
```

## Migration

```php
Schema::create('team_invitations', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('team_id')->constrained()->cascadeOnDelete();
    $table->foreignId('invited_by')->constrained('users')->cascadeOnDelete();
    $table->string('email');
    $table->string('role', 32)->default(TeamRole::Member->value);
    $table->timestamp('accepted_at')->nullable();
    $table->timestamp('expires_at');
    $table->timestamps();

    // Only one live invite per email per team.
    $table->unique(['team_id', 'email']);
    // Covering index for the pending-invites listing.
    $table->index(['team_id', 'accepted_at', 'expires_at']);
});
```

Index rationale belongs to `laravel-database-scale`; note it in the migration anyway so
the next reader knows the index is deliberate.

## Enum

```php
enum TeamRole: string
{
    case Owner  = 'owner';
    case Admin  = 'admin';
    case Member = 'member';

    public function canInvite(): bool
    {
        return $this !== self::Member;
    }

    public function label(): string
    {
        return match ($this) {
            self::Owner  => __('Owner'),
            self::Admin  => __('Administrator'),
            self::Member => __('Member'),
        };
    }
}
```

## Route

```php
Route::middleware(['auth'])->group(function (): void {
    Route::post('/teams/{team}/invitations', InviteTeamMemberController::class)
        ->middleware('throttle:invitations')
        ->name('teams.invitations.store');
});

// Signed, public — the signature IS the authentication.
Route::get('/invitations/{invitation}/accept', AcceptInvitationController::class)
    ->middleware(['signed', 'throttle:6,1'])
    ->name('invitations.accept');
```

## Form Request + custom rule

```php
final class InviteTeamMemberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('invite', $this->route('team'));
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc,dns', 'max:255', new NotAlreadyInvited($this->route('team'))],
            'role'  => ['required', Rule::enum(TeamRole::class)->except(TeamRole::Owner)],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => Str::lower(trim((string) $this->email))]);
    }
}
```

```php
final class NotAlreadyInvited implements ValidationRule
{
    public function __construct(private readonly Team $team) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $pending = $this->team->invitations()
            ->where('email', $value)
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->exists();

        if ($pending) {
            $fail(__('An invitation has already been sent to this address.'));
        }
    }
}
```

## Policy

```php
final class TeamPolicy
{
    public function invite(User $user, Team $team): Response
    {
        $role = $team->roleFor($user);

        if ($role === null) {
            return Response::denyAsNotFound();
        }

        return $role->canInvite()
            ? Response::allow()
            : Response::deny(__('Only owners and administrators can invite members.'));
    }
}
```

## DTO

```php
final readonly class InviteTeamMemberData
{
    public function __construct(
        public string $email,
        public TeamRole $role,
        public int $invitedBy,
    ) {}

    public static function fromRequest(InviteTeamMemberRequest $request): self
    {
        return new self(
            email:     $request->string('email')->toString(),
            role:      TeamRole::from($request->string('role')->toString()),
            invitedBy: $request->user()->id,
        );
    }
}
```

## Actions

```php
final class InviteTeamMember
{
    public function handle(Team $team, InviteTeamMemberData $data): TeamInvitation
    {
        if ($team->hasMemberWithEmail($data->email)) {
            throw new AlreadyAMember($data->email);
        }

        $invitation = $team->invitations()->create([
            'email'      => $data->email,
            'role'       => $data->role,
            'invited_by' => $data->invitedBy,
            'expires_at' => now()->addDays(7),
        ]);

        TeamMemberInvited::dispatch($invitation);

        return $invitation;
    }
}
```

```php
final class AcceptTeamInvitation
{
    public function handle(TeamInvitation $invitation, User $user): void
    {
        if ($invitation->isExpired() || $invitation->isAccepted()) {
            throw new InvitationNoLongerValid($invitation);
        }

        if (! hash_equals(Str::lower($invitation->email), Str::lower($user->email))) {
            throw new InvitationNotForThisUser();   // signed URL alone is not enough
        }

        DB::transaction(function () use ($invitation, $user): void {
            $invitation->team->members()->syncWithoutDetaching([
                $user->id => ['role' => $invitation->role],
            ]);

            $invitation->forceFill(['accepted_at' => now()])->save();
        });
    }
}
```

The email check matters: a signed URL proves the link was not tampered with, not that the
person clicking it is the invitee. Forwarded invitation emails are ordinary user behaviour.

## Event → listener → notification

```php
final class TeamMemberInvited
{
    use Dispatchable, SerializesModels;

    public function __construct(public readonly TeamInvitation $invitation) {}
}

final class SendTeamInvitationMail implements ShouldQueue
{
    public function handle(TeamMemberInvited $event): void
    {
        Notification::route('mail', $event->invitation->email)
            ->notify(new TeamInvitationSent($event->invitation));
    }
}
```

```php
final class TeamInvitationSent extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private readonly TeamInvitation $invitation) {}

    public function toMail(object $notifiable): MailMessage
    {
        $url = URL::temporarySignedRoute(
            'invitations.accept',
            $this->invitation->expires_at,
            ['invitation' => $this->invitation->id],
        );

        return (new MailMessage)
            ->subject(__('You have been invited to join :team', ['team' => $this->invitation->team->name]))
            ->line(__(':inviter invited you to join :team as :role.', [
                'inviter' => $this->invitation->inviter->name,
                'team'    => $this->invitation->team->name,
                'role'    => $this->invitation->role->label(),
            ]))
            ->action(__('Accept invitation'), $url)
            ->line(__('This invitation expires on :date.', [
                'date' => $this->invitation->expires_at->toDayDateTimeString(),
            ]));
    }
}
```

Note the action label is `Accept invitation`, not `Click here` — descriptive link text is
an accessibility requirement (`laravel-ui-accessibility`), and email is UI.

## Controllers

```php
final class InviteTeamMemberController
{
    public function __invoke(
        InviteTeamMemberRequest $request,
        Team $team,
        InviteTeamMember $invite,
    ): RedirectResponse {
        $invite->handle($team, InviteTeamMemberData::fromRequest($request));

        return back()->with('status', __('Invitation sent.'));
    }
}
```

## Cleanup

```php
// routes/console.php
Schedule::call(fn () => TeamInvitation::query()
    ->whereNull('accepted_at')
    ->where('expires_at', '<', now()->subDays(30))
    ->delete()
)->daily();
```

Every feature that creates rows needs an answer to "what deletes these?" — otherwise the
table grows forever. `laravel-database-scale` covers retention properly.

## Tests

```php
it('sends an invitation and emails the invitee', function (): void {
    Notification::fake();

    $team  = Team::factory()->create();
    $owner = User::factory()->create();
    $team->members()->attach($owner, ['role' => TeamRole::Owner]);

    actingAs($owner)
        ->post(route('teams.invitations.store', $team), [
            'email' => 'new@example.com',
            'role'  => 'member',
        ])
        ->assertRedirect();

    expect($team->invitations()->where('email', 'new@example.com')->exists())->toBeTrue();
    Notification::assertSentOnDemand(TeamInvitationSent::class);
});

it('forbids members from inviting', function (): void {
    // ...
    actingAs($member)->post(route('teams.invitations.store', $team), [...])->assertForbidden();
});

it('rejects an invitation accepted by a different user', function (): void {
    // ...
});
```

The negative cases are the important ones. `laravel-testing-qa` covers the full matrix.

## Layer trace

| Layer | File |
|---|---|
| Entrypoint | `InviteTeamMemberController` — 5 lines |
| Validation | `InviteTeamMemberRequest` + `NotAlreadyInvited` |
| Authorization | `TeamPolicy::invite` |
| Input contract | `InviteTeamMemberData` |
| Business operation | `InviteTeamMember` |
| Domain | `Team`, `TeamInvitation`, `TeamRole` |
| Consequence | `TeamMemberInvited` → `SendTeamInvitationMail` → `TeamInvitationSent` |
| Persistence | migration with deliberate indexes |
| Retention | scheduled prune |
| Verification | feature tests including negative paths |
