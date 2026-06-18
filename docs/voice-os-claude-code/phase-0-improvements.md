# Overview 

I want to dramatically improve the UI for the agent's feature. The UI lives in apps/electron/src/renderer/src/pages/bar.tsx

1. First, I want a permanent bar that lives at the top of the computer for agents. Hovering near that bar opens up the agent's bar, where I can view all of the agent conversations.

2. Second, I want a way to be able to continue a previous conversation or start a new conversation. It seems like right now, every time I talk to the agent mode, it starts a new conversation.

3. I want the UI to be very minimalist, and non-invasive. For example, when I hover out of the bar, it should minimize. Things to just run on the background too. 

4. I still want that main dictation pill to also show up. Give it some consistency with the existing dictation experience. 

5. Also, right now the sending is broken. We don't show the message that was sent in the chat. We also don't clear out the text input once the message is sent. 

Can you make this entire experience clean, minimalist, modern, and sexy? 