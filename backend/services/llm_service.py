import os
import asyncio
import google.generativeai as genai

class VivaChatSession:
    def __init__(self):
        self.chat = None
        self.context = ""
        
    def start_session(self, document_context: str):
        """
        Starts a new chat session using the document context.
        """
        self.context = document_context
        api_key = os.getenv("GEMINI_API_KEY")
        
        if not api_key or api_key == "your_gemini_api_key_here":
            print("Warning: Gemini API Key missing. Using stub chat.")
            return

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-flash-latest')
        
        # Initialize the chat with the system context
        # We simulate system instructions by sending the first message as context
        self.chat = model.start_chat(history=[])
        
        initial_prompt = (
            f"You are an expert examiner conducting a viva (oral exam). "
            f"Here is the context of the exam based on the uploaded document:\n\n{document_context}\n\n"
            f"Please wait for the student to speak. Keep your responses conversational, concise, and focused on examining the student."
        )
        try:
            self.chat.send_message(initial_prompt)
        except Exception as e:
            print(f"Error initializing chat: {e}", flush=True)
            self.init_error = str(e)
            self.chat = None

    async def get_response(self, user_message: str) -> str:
        """
        Send the user's message to Gemini and return the response.
        """
        if not self.chat:
            await asyncio.sleep(0.5)
            err = getattr(self, "init_error", "None. API key might be missing.")
            return f"[Stub Response to: {user_message}] (Chat not initialized. Error: {err})"
            
        try:
            # We use the synchronous API but we could wrap it in run_in_executor if it blocks too long.
            # For simplicity in this prototype, we'll just call it directly.
            response = self.chat.send_message(user_message)
            return response.text
        except Exception as e:
            print(f"Error getting response: {e}")
            return f"[Error: Could not generate response. {str(e)}]"
