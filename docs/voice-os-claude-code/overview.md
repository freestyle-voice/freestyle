Freestyle Voice: Voice OS for Claude Code
Matthew Wang

Freestyle Voice today is the open source voice dictation app, converting speech to text and pasting it into the clipboard. Local-first and private alternative to Wispr Flow. We’ve achieved that and did it well. We’ve built a voice stack that is low latency, multi-lingual, and has post-processing to clean up transcriptions. 

I’ve been using Freestyle a lot to accelerate my personal development workflow. I wrote about my Freestyle + Claude Code workflow here. In a nutshell, my workflow for coding a new feature is: 
Write up a product spec in markdown that lives in my project. I’ll use Freestyle to write this spec super fast
Feed that markdown into Claude Code, have Claude Code write up a technical spec for me. 
Iterate with Claude Code to polish the spec and implement. Using Freestyle to speak directly into Claude Code on terminal. 

I’m sure many of you have a similar workflow. It however made me think, what if I could run my same workflow without ever touching my mouse and keyboard? What if I had a Voice OS that could do anything for me on my computer via voice? Turn my thoughts into reality instantly. 

Aditya and I have a lot of experience building dev tools. We spent the past couple of weeks thinking about how to clone Wispr Flow, but not inventing anything new and pushing boundaries. Let’s do that by extending Freestyle to become the Voice OS for developers. 
Voice OS for Claude Code 
We imagine Voice OS to be the interface in which you can do anything on claude code, all with voice. Let’s bring J.A.R.V.I.S to real life, it would truly feel intelligent.

Here are the high level features we want Freestyle to be able to do: 
Hold a hotkey, speak, then press enter to trigger a query within Claude Code. Freestyle uses Claude CLI, so Freestyle will have all of Claude Code’s capabilities. 
Access to computer use. Freestyle + Claude Code is context aware and can take action on your computer the way you would personally would. CC can also see what’s on your computer to enable computer use. 
Still have the ability to do regular Wispr-like dictation with a hotkey. This is helpful for tweaking queries to send to Claude.
Freestyle lives anywhere, one hotkey away at all times. Have access to Claude anywhere on your computer. Claude can interact with everything you can. 
Uses your existing claude code subscription and monthly usage. No need to pay for another subscription to get this working. 

Examples of things you can do on Freestyle VoiceOS

“Hey, I am not sure how to use Vercel. Can you show me where I can buy a new domain and where I can create new deployments?” -> Freestyle takes a look at your screen, what the Versa dashboard looks like, and takes actions on your behalf to guide you through the Vercel Dashboard.
“Can you check what emails and calendar events I have today? -> Freestyle uses the Gmail and Google Calendar connectors via CC that it has to search this up.
“Can you help me look at this spec, then write an implementation plan?” Freestyle uses CC to investigate the spec and write a plan for approval. 
Voice component
We'll have two separate feature sets: one for the existing voice dictation feature, and another for the new Claude Code Coding Agents feature. Holding the globe key will just do voice dictation. What we currently have functioning similar to Whisperflow. 

We'll have a separate hotkey where you can speak to a Claude code instance. You can modify your query in place within Freestyle before sending. And you still need to hit enter on freestyle to kick off to fire a query on claude code.

Just like how Freestyle currently has a voice bill that always shows up no matter what screen you run, Freestyle will also have a bottom bar fixed UI where you can see query conversations just like CC desktop app. This bar is always on, allowing the user to have access to claude code on any surface. 

Here's what a full end-to-end workflow would look like theoretically.

Hold hotkey: “I want to build a new feature today on the Freestyle landing page, can you open up Cursor?” -> Freestyle does that
Hold hotkey: “Can you draft up a spec on how you would implement a login / auth flow”? -> Freestyle triggers CC to write up the spec
Hold hotkey: “Can you implement it, then show me what the site looks like” -> Freestyle triggers CC to implement, then uses computer use to open up chrome to show the page 

And more but you get the idea. Voice is becoming the new way to interface with everything. 
Why Claude Code
We chose to only focus on Claude Code today for several reasons. The first is in its popularity and familiarity. It will be easier for users to understand who Freestyle is for if we focus on Claude Code first. 

Claude code and its underlying agent SDK is the current state of the art agent harness. It also has a computer use feature, which is great for our use case. Lastly, a huge proportion of developers in the community already have a Claude Code subscription, which they would be more than happy to use inside Freestyle. 
Building on top of Freestyle dictation
We will be building this on top of the existing free style feature set. We already have voice dictation built, so let's leverage that into the cloud code and computer use features. 
Overall backend changes
On the back end, we will have Claude Agents SDK running that uses the Claude Code CLI already installed on the user's computer. The prerequisite must be that the user already has Claude Code CLI downloaded and they're authenticated. 

With Claude Agents SDK downloaded and running locally, it will be able to operate exactly how Claude code normally would run on the CLI locally. We will also be giving Claude Agents SDK the computer use tool. This computer use tool set allows Claude Agents SDK to take screenshots of the current user screen. And use tools to totally control the user's computer.
Product front end changes
On the front end, we'll have a new page in Freestyle dedicated to Claude code. This new interface will be very similar to Claude Code Desktop, where you can see all of the past Claude Code conversations/sessions. Ideally, we don't have to save anything inside of the freestyle database because Claude code transcripts should live in a set folder directory in the computer. 

We'll have to make some significant changes to the “Always Alive UI”, such as the existing pill interface that we have. We will have a permanent thin small bar that lives on the bottom of the screen. Hovering over it allows the user to see all of the past agent conversations and existing agents that are queued up and/or running. We want the user to be able to see everything, but not make the interface so overwhelming that it takes up the entire screen.

Interacting with clock code through freestyle is very simple. We will have a hot key set up that is different from the hot key for dictation only. When you're holding the Claude Code Interaction hotkey, the user will speak, and after they release, the text will be pasted in a text input. However, we do not want to send that message automatically. We want to allow the user to be able to continue to edit/ tweak that message before sending, or to be able to scrap that prompt entirely. The user can use the voice dictation mode to clean up that query.

Once it is submitted, Freestyle will trigger the CloudCreate CLI and run agents on that query. We should be showing that run just like how Claude Code shows it, with streaming. 
