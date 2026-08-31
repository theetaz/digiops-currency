// Clef policy for an unattended WSO2 Clique sealer.
// The startup script replaces the placeholder with this node's public signer
// address before attesting the ruleset.

var expectedSigner = "__SEALER_ACCOUNT__";

function OnSignerStartup(info) {}

// Geth must discover the public sealer address when it connects to Clef.
// Clef is IPC-only, so this approval is not reachable from the network.
function ApproveListing() {
    return "Approve";
}

function ApproveSignData(request) {
    if (!request || request.content_type !== "application/x-clique-header") {
        return "Reject";
    }
    if (!request.address || request.address.toLowerCase() !== expectedSigner) {
        return "Reject";
    }
    if (!request.meta || request.meta.scheme !== "ipc") {
        return "Reject";
    }
    if (!request.messages) {
        return "Reject";
    }
    for (var i = 0; i < request.messages.length; i++) {
        var message = request.messages[i];
        if (message.name === "Clique header" && message.type === "clique") {
            return "Approve";
        }
    }
    return "Reject";
}

// Wallet transactions must already be signed by their originating wallet.
// The consensus signer must never sign transactions or arbitrary messages.
function ApproveTx(request) { return "Reject"; }
function ApproveNewAccount(request) { return "Reject"; }
function ApproveSignTypedData(request) { return "Reject"; }
