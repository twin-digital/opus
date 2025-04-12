# PGP Signing in Devcontainers with YubiKey

## Get pgp working on Windows

- Install GPG4Win (kleopatra, agent, etc.). My working version was:

      PS C:\Users\sean> gpg --version
      gpg (GnuPG) 2.4.7
      libgcrypt 1.11.0
      Copyright (C) 2024 g10 Code GmbH
      License GNU GPL-3.0-or-later <https://gnu.org/licenses/gpl.html>
      This is free software: you are free to change and redistribute it.
      There is NO WARRANTY, to the extent permitted by law.

      Home: C:\Users\sean\AppData\Roaming\gnupg
      Supported algorithms:
      Pubkey: RSA, ELG, DSA, ECDH, ECDSA, EDDSA
      Cipher: IDEA, 3DES, CAST5, BLOWFISH, AES, AES192, AES256, TWOFISH,
              CAMELLIA128, CAMELLIA192, CAMELLIA256
      Hash: SHA1, RIPEMD160, SHA256, SHA384, SHA512, SHA224
      Compression: Uncompressed, ZIP, ZLIB, BZIP2

- See Yubico docs for help: https://developers.yubico.com/PGP/SSH_authentication/Windows.html
- Create gpg-agent.conf

      enable-putty-support
      enable-ssh-support
      enable-win32-openssh-support
      default-cache-ttl 600
      max-cache-ttl 7200

- gpg-agent.conf needs to be in one or both of `C:\Users\sean\AppData\Local\gnupg` or `C:\Users\sean\AppData\Roaming\gnupg`
  - My working config had it both, and I didn't explore further
- Verify you can see keys (gpg --card-status, gpg --list-keys)

## Get pgp working on wsl2:

- Dependencies: `sudo apt install socat iproute2`j
- Get [wsl2-ssh-pageant](https://github.com/BlackReloaded/wsl2-ssh-pageant?tab=readme-ov-file) from its [release page](https://github.com/BlackReloaded/wsl2-ssh-pageant/releases/tag/v1.4.0)
  - **NOTE**: This utility is no longer mainained :E
- Place it on **Windows** filesystem, and symlink to a location in wsl for ease of use. I used the instructions from the github page above (update windows_destination as needed):

      windows_destination="/mnt/c/Users/YOUR_USER_NAME/tools/wsl2-ssh-pageant.exe"
      linux_destination="$HOME/.ssh/wsl2-ssh-pageant.exe"
      # Set the executable bit.
      chmod +x "$windows_destination"
      # Symlink to linux for ease of use later
      ln -s $windows_destination $linux_destination

- Add the following to your `.bashrc` (**NOTE**: The '-gpgConfigBasePath' is only needed if the sockets **on Windows** are not in `C:\Users\sean\AppData\Roaming\gnupg`. On my system, they were in ../Local/.., but the default is Roaming.):

      # https://gist.github.com/fedme/ca8f01f98519f31f1dafad8f4262443e
      export GPG_AGENT_SOCK="/run/user/${UID}/gnupg/S.gpg-agent"
      if ! ss -a | grep -q "$GPG_AGENT_SOCK"; then
        rm -rf "$GPG_AGENT_SOCK"
        wsl2_ssh_pageant_bin="$HOME/.ssh/wsl2-ssh-pageant.exe"
        if test -x "$wsl2_ssh_pageant_bin"; then
            (setsid nohup socat UNIX-LISTEN:"$GPG_AGENT_SOCK,fork" EXEC:"$wsl2_ssh_pageant_bin -gpgConfigBasepath 'C:/Users/sean/AppData/Local/gnupg' -gpg S.gpg-agent" >/dev/null 2>&1 &)
        else
            echo >&2 "WARNING: $wsl2_ssh_pageant_bin is not executable."
        fi
        unset wsl2_ssh_pageant_bin
      fi

      # extra gpg socket for devcontainer
      export GPG_AGENT_SOCK_EXTRA="/run/user/${UID}/gnupg/S.gpg-agent.extra"
      if ! ss -a | grep -q "$GPG_AGENT_SOCK_EXTRA"; then
        rm -rf "$GPG_AGENT_SOCK_EXTRA"
        wsl2_ssh_pageant_bin="$HOME/.ssh/wsl2-ssh-pageant.exe"
        if test -x "$wsl2_ssh_pageant_bin"; then
            (setsid nohup socat UNIX-LISTEN:"$GPG_AGENT_SOCK_EXTRA,fork" EXEC:"$wsl2_ssh_pageant_bin -gpgConfigBasepath 'C:/Users/sean/AppData/Local/gnupg' -gpg S.gpg-agent.extra" >/dev/null 2>&1 &)
        else
            echo >&2 "WARNING: $wsl2_ssh_pageant_bin is not executable."
        fi
        unset wsl2_ssh_pageant_bin
      fi

- I am not sure that the "EXTRA" socket is actually needed in modern versions of devcontainers/wsl/gpg2. However, I had it in my working setup.
- Configure ~/.gnupg/gpg-agent.conf

      enable-ssh-support
      extra-socket /run/user/${UID}/gnupg/S.gpg-agent.extra

- Disable default gpg-agent

      #!/bin/bash

      set -e

      echo "🛑 Stopping systemd gpg-agent user services..."
      systemctl --user stop gpg-agent.socket gpg-agent.service \
        gpg-agent-ssh.socket gpg-agent-extra.socket gpg-agent-browser.socket
      echo "🚫 Disabling socket activation..."
      systemctl --user disable gpg-agent.socket gpg-agent.service \
        gpg-agent-ssh.socket gpg-agent-extra.socket gpg-agent-browser.socket
      echo "⛓️ Masking services to prevent activation..."
      systemctl --user mask gpg-agent.socket gpg-agent.service \
        gpg-agent-ssh.socket gpg-agent-extra.socket gpg-agent-browser.socket
      echo "✅ GPG agent disabled."

- Remove sockets from `/run/user/${UID}/gnupg
- Restart wsl2 and test with gpg --card-status, gpg --list-keys, etc

## Get pgp working inside a Devcontainer

- Update the Dockerfile to install gnupg2

      # install gnupg2
      RUN apt-get update && apt-get install gnupg2 -y

- Configure git to use `gpg2` as the gpg binary
- It should just work now!

## Final Notes

- You are supposed to need `export GPG_TTY=$(tty)` in your bashrc. (Somewhere? WSL2? Devcontainer? Both?) I don't have it and things are fine.
- Relevant git config: user.signingkey, commit.gpgSign, tag.gpgSign, gpg.program, gpg.minTrustLevel
