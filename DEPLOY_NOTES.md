Please help to expand and improve these notes



Environment variables:
REDIS_HOST
REDIS_PORT
REDIS_PASS

NODE_ENV
PORT - Port to use for HTTP server
USE_IP
SERVER_TIMEOUT
NUM_CPU_CORES
DISABLE_AUTH - Set to `1` to disable authentication for local debugging

DEV_SECRET - Used to specify the secret used when verifying JWT tokens from the issuer 'calmid-debug'

HTTP_ANNOUNCE_ADDRESS -> The address to annouce (internally via redis for the SFU Gateway) for HTTP traffic, which is used for WebRTC signaling over websocket.
Defaults to the OS hostname, unless USE_IP is specified in which case it will select an IP address from the system's network interfaces to annouce.
Precedence for selection, from highest to lowest is External IPv4, External IPv6, Internal IPv4, Internal IPv6.

WEBRTC_ANNOUNCE_IP -> IP address to use in SDP messages when setting up a webRTC session, selects an IP address from the system's network interfaces.
Precedence for selection, from highest to lowest is External IPv4, External IPv6, Internal IPv4, Internal IPv6.

WEBRTC_INTERFACE_ADDRESS -> Force the SFU to listen for traffic on specific address, defaults to listen on "0.0.0.0" (all interfaces?)


AWS Specific environment variables:
REPORT_CLOUDWATCH_METRICS

--These are usually provided by AWS ECS
ECS_CONTAINER_METADATA_URI_V4
ECS_CONTAINER_METADATA_URI
AWS_REGION

Deprecated
PUBLIC_ADDRESS -> Use WEBRTC_ANNOUNCE_IP
HOSTNAME_OVERRIDE -> Use HTTP_ANNOUNCE_ADDRESS
USE_IP -> Use HTTP_ANNOUNCE_ADDRESS