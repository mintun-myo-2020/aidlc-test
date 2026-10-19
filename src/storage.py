import boto3
import os
from typing import Optional
from .models import Contact, Interaction


class CRMStorage:
    def __init__(self, region: str = None):
        region = region or os.environ.get("AWS_REGION", "us-east-1")
        self.dynamodb = boto3.resource("dynamodb", region_name=region)
        self.contacts_table = self.dynamodb.Table("mini-crm-contacts")
        self.interactions_table = self.dynamodb.Table("mini-crm-interactions")

    def create_contact(self, contact: Contact) -> Contact:
        self.contacts_table.put_item(Item=contact.__dict__)
        return contact

    def get_contact(self, contact_id: str) -> Optional[Contact]:
        response = self.contacts_table.get_item(Key={"id": contact_id})
        item = response.get("Item")
        return Contact(**item) if item else None

    def list_contacts(self) -> list[Contact]:
        response = self.contacts_table.scan()
        return [Contact(**item) for item in response.get("Items", [])]

    def find_contacts_by_name(self, name: str) -> list[Contact]:
        contacts = self.list_contacts()
        name_lower = name.lower()
        return [c for c in contacts if name_lower in c.name.lower()]

    def record_interaction(self, interaction: Interaction) -> Interaction:
        self.interactions_table.put_item(Item=interaction.__dict__)
        return interaction

    def list_interactions(self, contact_id: str) -> list[Interaction]:
        response = self.interactions_table.scan(
            FilterExpression="contact_id = :cid",
            ExpressionAttributeValues={":cid": contact_id},
        )
        return [Interaction(**item) for item in response.get("Items", [])]
