FROM mcr.microsoft.com/devcontainers/base:jammy

# setup terraform apt repository
RUN sudo apt-get update && sudo apt-get install -y gnupg software-properties-common \
  && wget -O- https://apt.releases.hashicorp.com/gpg | \
    gpg --dearmor | \
    sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null \
  && gpg --no-default-keyring \
    --keyring /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    --fingerprint \
  && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
    https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
    sudo tee /etc/apt/sources.list.d/hashicorp.list \
  && rm -rf /var/lib/apt/lists/*

# docker outside of docker setup
RUN sudo groupadd -f docker && sudo usermod -aG docker vscode

# install: gnupg2, lastpass cli, terraform
RUN sudo apt-get update && sudo apt-get --no-install-recommends -yqq install \
    gnupg2 \
    lastpass-cli \
    terraform \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# install yq
RUN wget https://github.com/mikefarah/yq/releases/download/v4.45.1/yq_linux_amd64 -O /usr/local/bin/yq &&\
    chmod +x /usr/local/bin/yq

# install earthly
RUN sudo wget https://github.com/earthly/earthly/releases/latest/download/earthly-linux-amd64 -O /usr/local/bin/earthly \
  && sudo chmod +x /usr/local/bin/earthly \
  && sudo /usr/local/bin/earthly bootstrap --no-buildkit --with-autocomplete

COPY rootfs/ /
RUN chmod +x /usr/local/bin/*

CMD ["sleep", "infinity"]
