from src.storage import CRMStorage
from src.agent import CRMAgent


def main():
    print("Mini CRM — chat with your agent (type 'quit' to exit)\n")
    storage = CRMStorage()
    agent = CRMAgent(storage)

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "bye"):
            print("Goodbye!")
            break

        response = agent.chat(user_input)
        print(f"\nAgent: {response}\n")


if __name__ == "__main__":
    main()
