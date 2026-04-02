# UWB CSS Course History Search

| Field | Info |
|-------|------|
| **NetID** | leonikot |
| **Name** | Leo Kotok |
| **GitHub Repository** | https://github.com/Leonikot/css382IntroToAI |
| **Deployed Site** | N/A |

## Idea

A web app that lets you search the historical course catalog for the Computing & Software Systems (CSS) program at UW Bothell. Search by **professor** to see every course and quarter they have taught, or search by **course** to see every instructor who has taught it and when.

Data is scraped from the UW Bothell Time Schedule (Autumn 2021 – Summer 2025) using `scrape.py`, which produces a local `data.js` file. The app runs entirely in the browser with no server or build step required — just open `index.html`.

## Usage

```bash
# Install dependencies
pip install requests beautifulsoup4

# Scrape course data (generates data.js)
python3 scrape.py

# Open the app
open index.html   # or double-click index.html
```
