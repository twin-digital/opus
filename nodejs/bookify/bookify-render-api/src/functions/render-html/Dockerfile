# Stage 1: Download and extract pandoc using Amazon Linux
FROM public.ecr.aws/amazonlinux/amazonlinux:2023 AS pandoc-builder

ARG PANDOC_VERSION=3.8.3
ARG PANDOC_CHECKSUM=""
RUN dnf install -y tar gzip && \
    curl -L https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz \
    -o pandoc.tar.gz && \
    if [ -n "$PANDOC_CHECKSUM" ]; then \
        echo "${PANDOC_CHECKSUM#sha256:}  pandoc.tar.gz" | sha256sum -c -; \
    else \
        curl -L https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz.sha256 \
        -o pandoc.tar.gz.sha256 && \
        sha256sum -c pandoc.tar.gz.sha256 && \
        rm pandoc.tar.gz.sha256; \
    fi && \
    tar xvzf pandoc.tar.gz --strip-components 1 -C /usr/local/ && \
    rm pandoc.tar.gz

# Stage 2: AWS Lambda runtime
FROM public.ecr.aws/lambda/nodejs:24

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy pandoc binary from builder
COPY --from=pandoc-builder /usr/local/bin/pandoc /usr/local/bin/pandoc
RUN pandoc --version

# Copy bundled function code
COPY package*.json ./
COPY dist/ ./dist/

CMD [ "dist/render-html/render-html.handler" ]
