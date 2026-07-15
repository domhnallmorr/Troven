# Troven

Troven is a project-focused tabbed file explorer built with Electron, React, and TypeScript.

It is intended for switching between work projects during the day while keeping each project's useful folders, tabs, notes, and links close to hand.

## Features

- Tabbed file explorer with saved tab state per project
- Active and archived project lists with customer and project number fields
- Reorderable project sidebar
- Quick Access sidebar with default Windows folders and custom collapsible groups
- Right-click file actions including rename, copy path/name, cut/copy/paste, duplicate, open in Explorer, open in CMD, and Open With
- Extension filters at file and tab level
- Editable breadcrumbs/address bar
- Dark themes
- Diary tool with date-based rich text notes
- PDF tools for extracting page ranges and merging PDFs
- Search modal for files/folders, extensions, subdirectories, and Python raw path output
- Local JSON storage with backup copies for project, settings, and diary data

## Requirements

- Windows
- Node.js and npm

Rust is not required.

## Installation

Clone or download the repository, then open a terminal in the Troven folder and install dependencies:

```powershell
npm.cmd install
```

Start the development version:

```powershell
npm.cmd run dev
```

Run tests:

```powershell
npm.cmd test -- --run
```

Build the renderer:

```powershell
npm.cmd run build
```

## Local Data

Troven stores runtime data beside the app folder:

- `projects.json`
- `settings.json`
- `diary.json`
- `backups/`

These files are ignored by Git. The backup folder keeps previous JSON copies so project/session data can be recovered if a file is corrupted.
