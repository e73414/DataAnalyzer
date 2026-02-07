# Project Guidelines

## Primary Objective

Create and update n8n workflows using the available n8n-mcp tool and n8n skills. The n8n instance is pre-configured and ready for use.

## n8n Workflow Rules

### Modification Restrictions

- **Only modify workflows explicitly identified by the user**
- **Tag Requirement**: A workflow must have the `AI-DEV` tag to be eligible for modification
- Never modify workflows without the `AI-DEV` tag, even if requested
- Always verify the tag exists before making any changes

### Before Modifying Any Workflow

1. Confirm the workflow ID/name with the user
2. Verify the `AI-DEV` tag is present on the workflow
3. Review the current workflow state
4. Explain proposed changes before implementing

## Best Practices

### Safety First

- **Read before write**: Always fetch and review a workflow before modifying it
- **Backup awareness**: Note the current state of a workflow before changes
- **Incremental changes**: Make small, testable changes rather than large overhauls
- **No destructive operations**: Never delete workflows without explicit user confirmation

### Workflow Development

- Use descriptive node names that explain their purpose
- Add workflow notes/descriptions for complex logic
- Keep error handling in mind - include error branches where appropriate
- Test workflows in inactive state before activating

### Communication

- Always report what was changed after modifications
- If a workflow lacks the `AI-DEV` tag, inform the user and do not proceed
- Ask for clarification when requirements are ambiguous
- Provide workflow IDs and names in responses for user verification

## n8n-mcp Adapter

The mcp-n8n adapter runs on `localhost:3000` and provides skill-based access to n8n workflows.

### Endpoints

- `GET /mcp/skills` - List available skills
- `POST /mcp/execute` - Execute a skill

### Available Skills

| Skill ID | Description |
|----------|-------------|
| `n8n-webhook` | Trigger any n8n workflow via its webhook path or workflowId |
| `n8n-code-javascript` | Run JavaScript code workflows |
| `n8n-code-python` | Run Python code workflows |
| `n8n-guardrails` | Run guardrails-style validation workflows |
| `n8n-expression-syntax` | Validate or run expression-syntax workflows |
| `n8n-mcp-tools-expert` | Advanced MCP tools for n8n |
| `n8n-node-configuration` | Configure or run node-configuration workflows |
| `n8n-validation-expert` | Run validation and QA workflows |
| `n8n-workflow-patterns` | Pattern-based workflow execution |

### Execution Format

```json
POST /mcp/execute
{
  "skill": "n8n-webhook",
  "params": {
    "webhookPath": "webhook/my-workflow"
  },
  "input": {
    "key": "value"
  }
}
```

Alternative using workflowId:
```json
{
  "skill": "n8n-webhook",
  "params": {
    "workflowId": "abcd-1234"
  },
  "input": {}
}
```

### Configuration

The adapter uses environment variables from `.env`:
- `N8N_BASE_URL` - Base URL of the n8n instance
- `N8N_API_KEY` - API key for authentication

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `N8N_BASE_URL not set` warning | Missing .env config | Check `mcp-n8n/.env` has valid `N8N_BASE_URL` |
| `unknown skill` error | Invalid skill ID | Use exact skill IDs from the skills table |
| `missing params.webhookPath or params.workflowId` | No path provided | Include either `webhookPath` or `workflowId` in params |
| Connection timeout | n8n unreachable | Verify n8n is running and URL is correct |
| 401/403 errors | Invalid API key | Check `N8N_API_KEY` in .env matches n8n settings |
| Webhook not found | Workflow inactive | Ensure the target workflow is activated in n8n |

**Diagnostic Commands:**
```bash
# Check if adapter is running
curl http://localhost:3000/

# List available skills
curl http://localhost:3000/mcp/skills

# Test n8n connectivity (from adapter container)
curl -H "X-N8N-API-KEY: <key>" <N8N_BASE_URL>/api/v1/workflows
```

---

## Pocketbase Frontend

Pocketbase serves as the frontend/database layer for applications that use n8n workflows as the backend processing engine.

### Architecture

```
[Pocketbase] <---> [mcp-pocketbase adapter] <---> [n8n workflows]
   (Data)            (localhost:3001)              (Processing)
```

### mcp-pocketbase Adapter

Runs on `localhost:3001` and provides CRUD operations for Pocketbase collections.

### Available Skills

| Skill ID | Description |
|----------|-------------|
| `pb-auth` | Authenticate with Pocketbase and get token |
| `pb-list-collections` | List all collections in Pocketbase |
| `pb-create-record` | Create a new record in a collection |
| `pb-get-record` | Retrieve a record by ID |
| `pb-list-records` | List records with optional filters |
| `pb-update-record` | Update an existing record |
| `pb-delete-record` | Delete a record by ID |

### Execution Examples

**List collections:**
```json
POST http://localhost:3001/mcp/execute
{
  "skill": "pb-list-collections",
  "params": {}
}
```

**Create a record:**
```json
{
  "skill": "pb-create-record",
  "params": {
    "collection": "tasks",
    "data": {
      "title": "Process data",
      "status": "pending"
    }
  }
}
```

**List records with filter:**
```json
{
  "skill": "pb-list-records",
  "params": {
    "collection": "tasks",
    "filter": "status='pending'",
    "page": 1,
    "perPage": 50
  }
}
```

### Integration Pattern: Pocketbase + n8n

1. **Data Entry**: User creates record in Pocketbase
2. **Trigger**: n8n webhook monitors Pocketbase or receives trigger
3. **Processing**: n8n workflow processes the data
4. **Update**: n8n updates Pocketbase record with results

**Example Flow:**
```
User submits form → Pocketbase stores record →
n8n webhook triggered → n8n processes data →
n8n updates Pocketbase with results → User sees result
```

### Pocketbase Configuration

Environment variables in `mcp-pocketbase/.env`:
- `PB_BASE_URL` - Pocketbase instance URL
- `PB_EMAIL` - Admin email for authentication
- `PB_PASSWORD` - Admin password

### Pocketbase Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Auth failed | Wrong credentials | Verify `PB_EMAIL` and `PB_PASSWORD` in .env |
| Collection not found | Typo or missing collection | Check collection name in Pocketbase admin |
| 403 Forbidden | Insufficient permissions | Check API rules in Pocketbase collection settings |
| Connection refused | Pocketbase not running | Verify Pocketbase server is up |

---

## Security Reminders

- Never commit `.env` files to version control
- Rotate API keys periodically
- Use environment-specific credentials (dev/staging/prod)
- Pocketbase admin credentials should be kept secure

## Prohibited Actions

- Modifying production workflows without `AI-DEV` tag
- Activating workflows without user approval
- Deleting workflows or nodes without explicit confirmation
- Storing credentials or sensitive data in workflow parameters
