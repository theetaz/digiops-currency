# Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com). All Rights Reserved.

# This software is the property of WSO2 LLC. and its suppliers, if any.
# Dissemination of any information or reproduction of any material contained
# herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
# You may not alter or remove any copyright or other notice from copies of this content.

FROM golang:1.22-alpine AS rpc-builder

WORKDIR /src
COPY rpc-filter.go .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /rpc-filter rpc-filter.go

FROM ethereum/client-go:alltools-v1.13.15

# Install any needed packages
RUN apk add --no-cache bash curl jq

# Create a user with a known UID/GID within range 10000-20000.
# This is required by Choreo to run the container as a non-root user.
RUN adduser \
    --disabled-password \
    --gecos "" \
    --uid 10014 \
    "choreo"

COPY --chown=10014:10014 node.sh clef-rules.js /opt/digiops/
COPY --from=rpc-builder --chown=10014:10014 /rpc-filter /opt/digiops/rpc-filter
RUN chmod 500 /opt/digiops/node.sh /opt/digiops/rpc-filter && \
    chmod 400 /opt/digiops/clef-rules.js

# Use the above created unprivileged user
USER 10014

# Document the public signed-transaction RPC, project-internal metrics and P2P.
EXPOSE 8545/tcp 6060/tcp 30303/tcp 30303/udp

# Set the entry point to the startup script
ENTRYPOINT ["/bin/sh", "/opt/digiops/node.sh"]
