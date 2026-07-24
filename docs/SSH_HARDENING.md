# VPS SSH and deploy access

## Current staged state

- Application deployments have a dedicated `deploy` Unix account.
- The account uses a project-specific Ed25519 key; password login for `deploy` is disabled because no password is set.
- The private key remains only on the operator workstation at
  `/home/ruslan/.ssh/classifiedstg_deploy_ed25519` with mode `0600`.
- `deploy` can inspect and operate Docker and can invoke only the explicitly
  listed `rsync`/Docker commands through passwordless sudo. Docker access is
  root-equivalent and the key must therefore be treated as a production secret.
- Direct root/password access remains temporarily enabled as the recovery path.
- UFW exposes only SSH, HTTP and HTTPS. Fail2ban's `sshd` jail bans an address
  for one hour after five failures in ten minutes.

Verify the independent channel:

```sh
ssh -o BatchMode=yes -o IdentitiesOnly=yes \
  -i /home/ruslan/.ssh/classifiedstg_deploy_ed25519 \
  deploy@93.93.116.147 'docker compose version'
```

## Before disabling password and direct root login

1. Copy the encrypted deploy private key to the approved password manager or
   offline recovery vault. Never put it in GitHub, `.env`, chat or a VPS backup.
2. Open a second terminal and verify a fresh `deploy` login.
3. Verify the hosting-provider rescue console and document who can access it.
4. Keep the existing root session open while validating `sshd -t` and a new
   deploy session.
5. Apply an sshd drop-in with `PasswordAuthentication no` and
   `PermitRootLogin no`; reload, do not restart, SSH.
6. Confirm deploy login and application health before closing the recovery
   session.

If key login fails before the final switch, leave the current SSH policy
unchanged. If it fails after the switch, use the provider rescue console to
remove the drop-in and reload SSH.

## Key rotation

Generate a new key to a new filename, append only its public key, test it in a
fresh session, then remove the old public key. Never overwrite the only working
key in place. Record the rotation date in the operations log.
