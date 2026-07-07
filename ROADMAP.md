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

# Roadmap (Last update 07/08/2026)

Hey there! I'm Matt. I'm one of the maintainers of Freestyle. I really appreciate you taking the time to go through our roadmap and considering contributing to the project. It means a lot

Below is the high level roadmap of this project. The roadmap is broken up into sections of the project. This roadmap is not concrete and is subject to change. If you'd like to propose changes to the roadmpa, please create a pull request for it. All suggestions are welcome. Consider joining our Discord community to participate in discussions!

Note that all goals below are high level goals, not specific tasks. It's this community's work to figure out how to achieve them. 

If you're interested in contributing, read the [CONTRIBUTING.md](CONTRIBUTING.md) for instructions.

# Freestyle Core
Lead: @matteo8p

**Objective:** Build quality, beautiful voice transcription

1️⃣ Simplify the models page. Make it easy for users to configure Freestyle Transcribe in the models page. Log in button to use Freestyle Transcribe if they're logged out. Also provide the option to configure local models at the bottom.

2️⃣ Modify the onboarding. Enforce sign in / create account in production (skippable on dev) "Sign in via Browser". Remove "Choose a different model" on the onboarding. Have them use Freestyle Transcribe from the start. 

3️⃣ Improve the UI. Simplify the tones page. Add the ability to manage billing

The above lists the new features that we want to build. We want to continue maintaining the cleanliness of our codebase and the robustness of the project. General UI/UX improvements and functional enhancements, along with bug fixes, are a continuous effort. 

# Cloud
Lead: @MathurAditya724

**Objective:** 

1️⃣ Make Freestyle Transcribe robust, fast, and accurate. Freestyle Transcribe must support all of our existing features, such as dictionary, vocabulary, and tone. We must try to do this in sub-second latency, shooting for 400 milliseconds. 

2️⃣ Add billing and managing to Freestyle Transcribe Pro. 

3️⃣ Have free tier be 1000 words / week. Set up billing on Stripe. Billing details are TBD, but we're shooting for $9 / month for Pro, unlimited usage and zero-data retention by default. 

# Future work (TBD)

1️⃣ Freestyle templates. When a user onboards freestyle, they can choose a template based on their role, such as software developer, student, healthcare, etc. Once they've chosen a role, we can give them special presets. These presets may contain things like custom vocabulary and a tailored experience. 
