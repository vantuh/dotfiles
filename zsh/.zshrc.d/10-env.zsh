# Interactive shell environment.
export POWERLINE_NERD_FONTS=1
export PLANNOTATOR_SHARE=disabled
export PILENS_DATA_DIR=~/.pi-lens/projects
export HERDR_AGENTS_LAYOUT=pane

# Pi cursor sdk pi extension config
export PI_CURSOR_EXPOSE_BUILTIN_TOOLS=1
export PI_CURSOR_PI_TOOL_BRIDGE=1
export PI_CURSOR_SETTING_SOURCES=project,plugins,team
export PI_CURSOR_MCP_CONNECT_TIMEOUT_SECONDS=5
# Long enough for herdr_agent waits (default timeoutMs=10m). Cursor SDK MCP
# default is 60s; pi-cursor-sdk raises to 3600s unless this overrides lower.
export PI_CURSOR_MCP_TOOL_TIMEOUT_SECONDS=3600
# export PI_CURSOR_PI_TOOL_BRIDGE_DEBUG=1
# export PI_CURSOR_PI_TOOL_BRIDGE_DEBUG_FILE=/tmp/pi-cursor-bridge.ndjson
# export PI_CURSOR_SDK_EVENT_DEBUG=1

# kiro-acp pi extension debug logging (0 = off). Set to 1 to write /tmp/kiro-acp-debug.log
export PI_KIRO_ACP_DEBUG=0
