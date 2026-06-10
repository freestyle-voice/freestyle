<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/freestyle-logo-full-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="media/freestyle-logo-full-light.png">
    <img alt="Freestyle" src="media/freestyle-logo-full-light.png" width="420">
  </picture>
</p>

<p align="center">
  <a href="https://discord.gg/Fmgt5yZCDu"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2.svg?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

# Roadmap (Last update 06/09/2026)

Hey there! I'm Matt. I'm one of the maintainers of Freestyle. I really appreciate you taking the time to go through our roadmap and considering contributing to the project. It means a lot

Below is the high level roadmap of this project. The roadmap is broken up into sections of the project. This roadmap is not concrete and is subject to change. If you'd like to propose changes to the roadmpa, please create a pull request for it. All suggestions are welcome. Consider joining our Discord community to participate in discussions!

Note that all goals below are high level goals, not specific tasks. It's this community's work to figure out how to achieve them. 

If you're interested in contributing, read the [CONTRIBUTING.md](CONTRIBUTING.md) for instructions.

# Freestyle Core
Lead: @matteo8p
Core open source transcription features. This section is always going to be in progress. 

**Objective:** Our mission is to build open source voice dictation with world class latency and accuracy. We should be able to provide that for free and private. The goal of this section of the project is to work towards these optimizations, and deliver great UX. 

1️⃣ All features must work _consistently_ across all platforms (Mac, Windows, Linux). Limit the amount of platform divergence (feature exists on Linux, not on Windows etc.) 

2️⃣ [STT models] Transcription latency is optimized. This means that Freestyle efficiently uses all STT models end to end. Minimizes time from user stops talking to paste. 

3️⃣ [STT models] Transcription accuracy is high. Users must be guided to use high quality models that transcribe accurately. Inferior models are dismissed.  

4️⃣ [STT models] ASR biasing works across all models. Remove models that don't have ASR biasing. Again, all features must work. Make sure ASR biasing works consistently. 

5️⃣ [Post processing] Post processing is high quality and high latency. Does corrections like clean out "uhms, buts", and "It's 4:00, wait scratch that, it's 5:00" -> "it's 5". The type of nice post-processing experience that Wispr Flow has. 

6️⃣ [Post processing] Context aware corrections. Depending on what the user is seeing, format the text for that format. This is the formats feature

7️⃣ [Post processing] Dictionary / Shortcuts feature works consistently. 

8️⃣ Codebase must be clean and extendable. Much of the codebase has been vibed today. That's okay to start, but not sustainable to maintain long term. Clean up the codebase and ensure it's easy to onboard, easy to work with long term. 

# Cloud
Lead: @MathurAditya724

**Objective:** Freestyle is open source and local-first, but we a consistent pitfall I've seen is that it alienates the non-developer. Non-developers may not know how to set up an API key or understand which models to choose and use. We plan to spin up a simple cloud service that is highly opinionated and is a high quality dictation stack out of the box. What's he saying?

1️⃣ Open source the project. The code for the cloud service will be MIT license open source. We will have our hosted version, but anyone is free to use that code and self-host their own service.

2️⃣ This cloud service must have low latency and high accuracy with all of the features that Freestyle supports. It has the same specs as Freestyle Core.

3️⃣ Figure out the pricing structure. We want the pricing to be extremely cheap with a very small margin. Usage based billing. Still make this stack self-hostable and our cloud optional.

# Community and docs page
Lead: @matteo8p

**Objective:** Build a strong community of open-source contributors interested in working on voice dictation. Maintain the community discussions through Discord. Keep the GitHub repo clean and organized. Grow project interest. 