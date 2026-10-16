# ADR 0010: argon2id for password hashing

Status: Accepted

## Context
Passwords must be stored with a slow, memory-hard hash that is resistant to GPU cracking.

## Decision
Hash passwords with argon2id using the library defaults. Unknown emails are verified against a precomputed dummy hash so response time does not reveal whether an account exists.

## Alternatives considered
- **bcrypt:** widely supported and acceptable, but truncates input at 72 bytes and is not memory-hard.
- **scrypt/PBKDF2:** available in Node without native modules; PBKDF2 is the weakest against GPUs.

## Consequences
- A native module is required; prebuilt binaries cover common platforms and Docker images.
- Parameters should be reviewed periodically against hardware and latency budgets.
