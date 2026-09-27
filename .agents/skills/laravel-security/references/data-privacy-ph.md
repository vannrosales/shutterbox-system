# Data privacy — RA 10173 in application terms

> **Scope note.** This translates the Philippine Data Privacy Act into engineering
> requirements. It is not legal advice, and the National Privacy Commission issues
> circulars that change the detail. Have counsel or your Data Protection Officer confirm
> obligations for the specific system. The engineering controls below are sound regardless.

## The law in one paragraph

**RA 10173 (Data Privacy Act of 2012)**, with its IRR and NPC circulars, governs the
processing of personal information in the Philippines. It requires a lawful basis for
processing, transparency to data subjects, proportionality (collect only what you need),
security measures appropriate to the risk, breach notification, and honouring data-subject
rights. Organisations processing personal data at scale must register with the NPC and
appoint a **Data Protection Officer**.

Related: **RA 11055** (PhilSys national ID — additional restrictions), **RA 8792**
(E-Commerce Act), and sector rules (BSP for financial, DOH for health).

## Data classification

Classify every field before you store it.

| Class | Definition | Examples | Handling |
|---|---|---|---|
| **Personal information** | Identifies a person | Name, email, address, phone | Lawful basis, retention limit, subject rights |
| **Sensitive personal information** | Special categories under the Act | Health, race, religion, marital status, genetic, sexual life, offences, government IDs (SSS, TIN, PhilHealth, PhilSys) | Stricter basis, encrypt at rest, restrict access, log every read |
| **Privileged information** | Protected by legal privilege | Attorney–client communications | Strictest handling |
| **Non-personal** | Cannot identify | Aggregate counts, anonymised metrics | Ordinary handling |

Government-issued ID numbers are **sensitive** under the Act. A `tin` or `sss_number`
column needs encryption at rest and access logging, not just a `hidden` attribute.

```php
protected function casts(): array
{
    return [
        'tin'            => 'encrypted',
        'sss_number'     => 'encrypted',
        'philhealth_no'  => 'encrypted',
        'health_notes'   => 'encrypted',
    ];
}

protected $hidden = ['tin', 'sss_number', 'philhealth_no'];
```

## Engineering requirements

### 1. Lawful basis and consent

Record **which** basis applies per processing purpose, and if it is consent, record the
consent event.

```php
Schema::create('consents', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->string('purpose', 64);           // 'marketing', 'analytics', 'third_party_sharing'
    $table->boolean('granted');
    $table->string('policy_version', 16);    // which notice they agreed to
    $table->ipAddress('ip_address');
    $table->text('user_agent');
    $table->timestamp('granted_at')->nullable();
    $table->timestamp('withdrawn_at')->nullable();
    $table->timestamps();

    $table->index(['user_id', 'purpose']);
});
```

Consent UI requirements:
- **Opt-in, not opt-out.** No pre-ticked boxes.
- Granular per purpose — one checkbox for "everything" is not valid consent.
- Withdrawal must be as easy as granting.
- Record the policy version, so you know what they actually agreed to.

```blade
<fieldset>
    <legend>{{ __('How we may contact you') }}</legend>

    <div class="choice">
        <input type="checkbox" id="consent-marketing" name="consents[]" value="marketing">
        <label for="consent-marketing">
            {{ __('Send me product updates and offers') }}
        </label>
    </div>
    <p class="hint">{{ __('You can withdraw this at any time in your account settings.') }}</p>
</fieldset>
```

Accessibility of consent UI is governed by `laravel-ui-accessibility` — a consent form that
a screen-reader user cannot complete is not valid consent.

### 2. Privacy notice

Must state, in plain language: what is collected, why, the lawful basis, who it is shared
with, how long it is kept, the data subject's rights, and how to contact the DPO.

Version it. When it changes materially, re-consent.

### 3. Data subject rights — build the paths

| Right | What the application must do |
|---|---|
| **Informed** | Privacy notice, accessible and versioned |
| **Access** | Export everything you hold about them, in a readable format |
| **Object** | Stop processing for a purpose (usually marketing) |
| **Erasure / blocking** | Delete or anonymise on valid request |
| **Rectification** | Let them correct inaccurate data |
| **Data portability** | Machine-readable export (JSON/CSV) |
| **Damages** | Not an engineering control, but audit logs are your evidence |

```php
final class ExportPersonalData implements ShouldQueue
{
    public function handle(User $user): void
    {
        $data = [
            'profile'       => $user->only(['name', 'email', 'phone', 'created_at']),
            'orders'        => $user->orders()->get(['reference', 'total_minor', 'placed_at'])->toArray(),
            'consents'      => $user->consents()->get(['purpose', 'granted', 'granted_at'])->toArray(),
            'login_history' => $user->loginHistory()->latest()->limit(100)->get(['ip_address', 'created_at'])->toArray(),
        ];

        $path = "exports/personal-data/{$user->id}-".Str::ulid().'.json';

        Storage::disk('private')->put($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $user->notify(new PersonalDataReady(
            URL::temporarySignedRoute('privacy.download', now()->addHours(48), ['path' => $path])
        ));
    }
}
```

Private disk, signed expiring URL, and delete the export after the window. An export file
sitting in public storage is a breach waiting to happen.

### 4. Erasure that does not break the database

Full deletion often conflicts with referential integrity and with retention obligations for
financial records. Anonymise instead.

```php
final class AnonymiseUser
{
    public function handle(User $user, string $reason): void
    {
        DB::transaction(function () use ($user, $reason): void {
            $user->forceFill([
                'name'              => __('Deleted user'),
                'email'             => "deleted-{$user->id}@invalid.local",
                'phone'             => null,
                'address'           => null,
                'tin'               => null,
                'date_of_birth'     => null,
                'email_verified_at' => null,
                'password'          => Hash::make(Str::random(64)),
                'anonymised_at'     => now(),
            ])->save();

            $user->tokens()->delete();
            $user->sessions()->delete();
            $user->consents()->update(['withdrawn_at' => now()]);

            // Orders keep their row (financial retention) but lose the personal copy
            $user->orders()->update(['customer_name_snapshot' => __('Deleted user')]);

            AuditLog::record('user.anonymised', subject: $user, context: ['reason' => $reason]);
        });

        // The database is not the only copy
        $user->unsearchable();                      // search index
        Cache::forget("user:{$user->id}");          // cache
        // Also: analytics platform, email provider, CRM, support tool, backups
    }
}
```

**The copies people forget:** search index, cache, queue payloads, logs, error tracker,
email service provider, analytics, CRM, data warehouse, and backups. Maintain a written
inventory of every system that receives personal data, or erasure is incomplete by
construction.

Backups: you generally cannot surgically delete from a backup. The accepted approach is a
documented retention window for backups plus a process that re-applies erasure if a backup
is ever restored. Write that down.

### 5. Retention

```php
final class UserActivity extends Model
{
    use MassPrunable;

    public function prunable(): Builder
    {
        return static::where('created_at', '<', now()->subMonths(12));
    }
}
```

| Data | Typical retention |
|---|---|
| Marketing data | While consent stands |
| Session/auth logs | 6–12 months (security investigation) |
| Financial records | Per tax law — commonly several years |
| Application logs with PII | Minimise; scrub at ingestion |
| Analytics | Aggregate and anonymise, then keep indefinitely |

Document the period **and the reason** per data category. "We keep it forever because
storage is cheap" is not a lawful basis.

### 6. Breach notification

The Act requires notification to the NPC and affected data subjects for breaches involving
sensitive personal information or information that could enable identity fraud, where there
is a real risk of serious harm. Timelines are prescribed — confirm the current requirement
with your DPO.

Engineering prerequisites for meeting any notification deadline:

- **Audit logs** that show what was accessed, by whom, and when
- **Data inventory** — which systems hold which categories
- **Detection** — alerting on bulk reads, unusual export volume, authorization-denial spikes
- **A runbook** with named roles and contact details, tested

```php
Event::listen(function (BulkDataAccessed $event): void {
    Log::channel('security')->alert('Bulk personal data access', [
        'actor'   => $event->userId,
        'records' => $event->count,
        'type'    => $event->dataType,
        'ip'      => request()->ip(),
    ]);
});
```

You cannot report on a breach you cannot reconstruct.

### 7. Access logging for sensitive data

```php
final class LogSensitiveAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        AuditLog::record(
            action: 'sensitive_data.viewed',
            subject: $request->route('patient'),
            causer: $request->user(),
            context: ['fields' => ['health_notes'], 'ip' => $request->ip()],
        );

        return $response;
    }
}
```

For health, financial, and government-ID data, log **reads**, not just writes. That is the
only way to answer "who looked at this record?"

### 8. Cross-border transfer

Using a cloud region outside the Philippines is a transfer. Obligations follow the data —
you remain accountable for processing done by your processors abroad. Requirements:

- Disclose it in the privacy notice
- Have a data processing agreement with the provider
- Confirm the destination offers an adequate level of protection, or use appropriate
  contractual safeguards

Practically: document your regions and sub-processors, and keep the list current.

## Design principles that satisfy most of the above

**Data minimisation.** The strongest privacy control is not collecting the data.

```php
// Do you need date of birth, or just "is over 18"?
$table->boolean('is_of_age');          // not $table->date('date_of_birth')

// Do you need the full address, or the city for shipping estimates?
// Do you need to store the ID number, or just verify it once and keep a hash?
```

Every field you do not store is a field that cannot leak, cannot be subpoenaed, cannot be
mis-exported, and does not need a retention policy.

**Privacy by default.** The most protective setting is the initial one. Sharing, public
profiles, and marketing are opt-in.

**Pseudonymise early.** Use internal IDs in logs, analytics, and third-party tools rather
than email addresses.

## Checklist

- [ ] Every personal-data field classified (personal / sensitive / privileged)
- [ ] Sensitive fields encrypted at rest and in `$hidden`
- [ ] Lawful basis documented per processing purpose
- [ ] Consent recorded with purpose, version, timestamp, IP — and withdrawable
- [ ] Privacy notice published, versioned, and accessible
- [ ] Data export path built and tested
- [ ] Anonymisation path built, covering search index, cache, and third parties
- [ ] Retention period set per category, with prune jobs scheduled and verified running
- [ ] Access logging on sensitive-data reads
- [ ] Data inventory maintained — every system receiving personal data listed
- [ ] Breach runbook written, with DPO contact details, and tested
- [ ] Sub-processors and data locations documented
- [ ] PII scrubbed from application logs and the error tracker
- [ ] DPO appointed and NPC registration considered
