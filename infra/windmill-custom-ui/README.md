# Windmill deployment image

This Railway service runs the official pinned Windmill image without locally
patching or rebuilding Windmill source code. LumenClip-specific behavior belongs
in deployed flows and scripts, not in a forked Windmill frontend.

Update the digest deliberately and verify shared workflows before deploying the
`windmill-server` service.
