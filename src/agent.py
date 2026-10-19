import json
import os
import boto3
from .models import Contact, Interaction
from .storage import CRMStorage


SYSTEM_PROMPT = """You are a helpful CRM assistant. You help users manage contacts and record interactions.

You have access to these tools:
- create_contact: Create a new contact (name required; email, phone, company, notes optional)
- list_contacts: List all contacts
- find_contact: Find contacts by name
- record_interaction: Log an interaction with a contact (contact name or id, type, outcome, notes)
- list_interactions: Show interactions for a contact

When the user asks you to do something, use the appropriate tool. Always confirm what you did.
Interaction types are: call, email, meeting, other.
"""


class CRMAgent:
    def __init__(self, storage: CRMStorage, model_id: str = None, region: str = None):
        region = region or os.environ.get("AWS_REGION", "us-east-1")
        self.storage = storage
        self.model_id = model_id or os.environ.get(
            "BEDROCK_MODEL_ID", "anthropic.claude-3-5-haiku-20241022-v1:0"
        )
        self.bedrock = boto3.client("bedrock-runtime", region_name=region)
        self.conversation_history = []

    def _call_tool(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "create_contact":
            contact = Contact(**tool_input)
            self.storage.create_contact(contact)
            return f"Created contact: {contact.name} (id: {contact.id})"

        elif tool_name == "list_contacts":
            contacts = self.storage.list_contacts()
            if not contacts:
                return "No contacts found."
            return "\n".join(
                f"- {c.name} (id: {c.id})" + (f" — {c.email}" if c.email else "")
                for c in contacts
            )

        elif tool_name == "find_contact":
            name = tool_input.get("name", "")
            matches = self.storage.find_contacts_by_name(name)
            if not matches:
                return f"No contacts found matching '{name}'."
            return "\n".join(f"- {c.name} (id: {c.id})" for c in matches)

        elif tool_name == "record_interaction":
            name = tool_input.pop("contact_name", None)
            if name:
                matches = self.storage.find_contacts_by_name(name)
                if not matches:
                    return f"No contact found with name '{name}'."
                tool_input["contact_id"] = matches[0].id
            interaction = Interaction(**tool_input)
            self.storage.record_interaction(interaction)
            return f"Recorded {interaction.interaction_type} interaction (id: {interaction.id})"

        elif tool_name == "list_interactions":
            name = tool_input.get("contact_name")
            contact_id = tool_input.get("contact_id")
            if name and not contact_id:
                matches = self.storage.find_contacts_by_name(name)
                if not matches:
                    return f"No contact found with name '{name}'."
                contact_id = matches[0].id
            interactions = self.storage.list_interactions(contact_id)
            if not interactions:
                return "No interactions recorded."
            return "\n".join(
                f"- [{i.interaction_type}] {i.occurred_at[:10]}: {i.outcome or ''} — {i.notes or ''}"
                for i in interactions
            )

        return f"Unknown tool: {tool_name}"

    def chat(self, user_message: str) -> str:
        self.conversation_history.append({"role": "user", "content": user_message})

        tools = [
            {
                "toolSpec": {
                    "name": "create_contact",
                    "description": "Create a new CRM contact",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "email": {"type": "string"},
                                "phone": {"type": "string"},
                                "company": {"type": "string"},
                                "notes": {"type": "string"},
                            },
                            "required": ["name"],
                        }
                    },
                }
            },
            {
                "toolSpec": {
                    "name": "list_contacts",
                    "description": "List all contacts",
                    "inputSchema": {"json": {"type": "object", "properties": {}}},
                }
            },
            {
                "toolSpec": {
                    "name": "find_contact",
                    "description": "Find contacts by name",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {"name": {"type": "string"}},
                            "required": ["name"],
                        }
                    },
                }
            },
            {
                "toolSpec": {
                    "name": "record_interaction",
                    "description": "Record an interaction with a contact",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {
                                "contact_name": {"type": "string"},
                                "contact_id": {"type": "string"},
                                "interaction_type": {
                                    "type": "string",
                                    "enum": ["call", "email", "meeting", "other"],
                                },
                                "outcome": {"type": "string"},
                                "notes": {"type": "string"},
                            },
                            "required": ["interaction_type"],
                        }
                    },
                }
            },
            {
                "toolSpec": {
                    "name": "list_interactions",
                    "description": "List interactions for a contact",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {
                                "contact_name": {"type": "string"},
                                "contact_id": {"type": "string"},
                            },
                        }
                    },
                }
            },
        ]

        while True:
            response = self.bedrock.converse(
                modelId=self.model_id,
                system=[{"text": SYSTEM_PROMPT}],
                messages=self.conversation_history,
                toolConfig={"tools": tools},
            )

            output = response["output"]["message"]
            self.conversation_history.append(output)
            stop_reason = response["stopReason"]

            if stop_reason == "end_turn":
                for block in output["content"]:
                    if "text" in block:
                        return block["text"]
                return ""

            elif stop_reason == "tool_use":
                tool_results = []
                for block in output["content"]:
                    if "toolUse" in block:
                        tool_use = block["toolUse"]
                        result = self._call_tool(tool_use["name"], tool_use["input"])
                        tool_results.append(
                            {
                                "toolResult": {
                                    "toolUseId": tool_use["toolUseId"],
                                    "content": [{"text": result}],
                                }
                            }
                        )
                self.conversation_history.append(
                    {"role": "user", "content": tool_results}
                )
            else:
                break

        return "Sorry, I couldn't complete that request."
