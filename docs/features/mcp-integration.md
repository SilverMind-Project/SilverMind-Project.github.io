# MCP Integration

Cognitive Companion includes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes read-only tools for AI agent integration. Agents can discover system state, query sensor data, inspect enrollment and e-ink status, check person locations, and trigger rule executions, all without requiring a public endpoint.

## What is MCP?

The Model Context Protocol is an open standard for connecting AI models to external tools and data sources. It provides a structured way for AI agents to:

- **Discover** available tools and their parameters
- **Execute** tools with validated inputs
- **Receive** structured responses

Cognitive Companion's MCP server allows external AI agents (Claude, GPT, custom agents) to interact with the senior care system as part of their tool-calling workflows.

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_rooms` | List all configured rooms | None |
| `get_sensors` | List sensors | `room_id`, `sensor_type` (optional filters) |
| `get_room_occupancy` | Current occupancy from presence sensors | None |
| `get_recent_images` | Recent camera images for a sensor | `sensor_id`, `limit` |
| `get_light_level` | Illuminance from a HA sensor | `sensor_id` |
| `get_alerts` | Recent emergency alerts | `limit`, `resolved` (optional) |
| `get_event_logs` | Rule execution event logs | `rule_name`, `status`, `limit` |
| `get_rules` | Configured automation rules | None |
| `get_conversation_history` | Recent conversation turns | `limit` |
| `get_person_locations` | Current location of all tracked members | None |
| `get_enrolled_persons` | Household members known to the system, for enrollment-aware agent flows | None |
| `get_person_sightings` | Camera sighting history for a person | `person_id`, `limit` |
| `get_person_activities` | Recent detected activities | `person_id`, `activity_type` |
| `get_workflow_executions` | Recent pipeline workflow executions | `rule_id`, `status`, `limit` |
| `get_rule_pipeline` | Pipeline step definitions for a rule | `rule_id` |
| `trigger_rule` | Manually trigger a rule's pipeline | `rule_id` |
| `get_eink_display_status` | Active e-ink image state for one or all devices | `sensor_id` (optional) |

## Authentication

MCP tools require authentication via the MCP API key. The key is configured in `config/auth.yaml`:

```yaml
api_keys:
  - key: ${CC_MCP_API_KEY}
    name: mcp_agent
    permissions:
      - mcp_readonly
```

The `mcp_readonly` permission grants:
- Read access to all `/api/v1/*` endpoints
- Execute access to MCP tools
- Ability to trigger rule executions

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/mcp/tools` | List available tools with their schemas |
| `POST` | `/api/v1/mcp/tools/{name}` | Execute a tool by name |

### Tool Discovery

```bash
curl -H "X-API-Key: $CC_MCP_API_KEY" http://localhost:8000/api/v1/mcp/tools
```

Returns a list of tool definitions with names, descriptions, and parameter schemas.

### Tool Execution

```bash
curl -X POST \
  -H "X-API-Key: $CC_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"person_id": "grandma"}' \
  http://localhost:8000/api/v1/mcp/tools/get_person_sightings
```

## Integration Patterns

### With Claude Desktop

Configure Claude Desktop's MCP settings to point to your Cognitive Companion instance:

```json
{
  "mcpServers": {
    "cognitive-companion": {
      "url": "http://your-cc-host:8000/api/v1/mcp",
      "headers": {
        "X-API-Key": "your_mcp_key"
      }
    }
  }
}
```

### With Custom Agents

Any agent framework that supports MCP tool calling can integrate with Cognitive Companion. The agent:

1. Discovers tools via `GET /api/v1/mcp/tools`
2. Calls tools via `POST /api/v1/mcp/tools/{name}`
3. Receives structured JSON responses

### Example Agent Workflow

An AI agent monitoring the household might:

1. Call `get_person_locations` to check where everyone is
2. Call `get_enrolled_persons` to see which household members are available for face-aware flows
3. Call `get_person_activities` to check if lunch has been eaten
4. If lunch has not been detected, call `trigger_rule` on the lunch reminder rule
5. Call `get_alerts` to check for any unresolved emergencies

## Network Considerations

The MCP server runs on the same backend instance, so no additional deployment is needed. Since Cognitive Companion runs on-premise without a public endpoint, MCP clients must be on the same local network. For remote agent access, consider:

- VPN or tailnet for secure remote access
- A reverse proxy with authentication for controlled exposure

## Adding New Tools

See the [development guide](/development/extending-pipeline) for instructions on adding new MCP tools to the registry.
