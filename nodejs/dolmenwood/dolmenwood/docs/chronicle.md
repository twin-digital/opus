# Chronicle

The **Chronicle** system is a TypeScript library for modeling, storing, and linking the major structural elements of a tabletop RPG campaign. It provides a unified hierarchy of _in-fiction_ and _out-of-fiction_ constructs including worlds, adventures, expeditions, journeys, delves, sessions, and more. This allows tools to reason about gameplay at any scale.

## Contents

- [Overview](#overview)
- [In-Fiction Elements](#in-fiction-elements)
- [Out-of-Fiction Elements](#out-of-fiction-elements)
- [Hierarchy](#hierarchy)
  - [In-Fiction Structures](#in-fiction-structures)
  - [Out-of-Fiction Structures](#out-of-fiction-structures)

## In-Fiction Elements

- **World** — The grand container for all fictional data.
- **Adventure** — A large-scale story goal.
- **Expedition** — A continuous foray into the wilds.
- **Journey** — Moving from hex to hex.
- **Survey** — Exploring the interior of a region/hex.
- **Delve** — Exploring a site-scale location.
- **Scene** — A discrete narrative moment.
- **Downtime** — Haven-based activities.

## Out-of-Fiction Elements

- **Campaign** — The group of players and table policies.
- **Session** — A meeting where play occurs.

---

## Hierarchy

The chronicle organizes all major gameplay units into a coherent hierarchy. This allows you to track progress, establish links between events, and model the flow of play from the world level down to individual scenes.

The model is further divided into **In-Fiction** (story/world elements) and **Out-of-Fiction** (real-world play structures).

### **In-Fiction Structure (largest → smallest)**

1. **World**  
   The full campaign setting: its timeline, histories, factions, locations, cultures, and geography.

2. **Adventure**  
   A major narrative arc with a central purpose.  
   Examples: _Rebuild the ruined abbey_, _Free the lost prince_, _Break the faerie curse_.  
   Composed of multiple expeditions and downtime periods.
   A character may be participating in multiple adventures simultaneously.

3. **Expedition**  
   Any venture outside a haven or safe settlement.  
   Represents continuous time spent “in the field,” regardless of distance traveled.
   A character only participates in one expedition at a time.

   **Within an Expedition:**
   - **Journey** – Inter-hex travel across the wilderness.
   - **Survey** – Thorough exploration within a single hex.
   - **Delve** – Investigation of a localized site such as a ruin, barrow, cave, or faerie landmark.

4. **Scene**  
   A specific, moment-to-moment event: an encounter, campsite, negotiation, combat, discovery, or similar episode.

5. **Downtime**  
   Activities within a safe haven: crafting, carousing, research, training, recovery.  
   Occurs between expeditions or between major beats of an adventure.

---

### **Out-of-Fiction Structure**

1. **Campaign**  
   The real-world table: the group of players, its policies, schedule, and social structure.  
   A campaign contains many adventures across real time.  
   The world may have multiple ongoing campaigns at once.

2. **Session**  
   A real-world meeting of players.  
   One session may advance any number of in-fiction elements (scenes, delves, journeys, etc.).

## Summary

Chronicle supplies a structured, extensible model for RPG tooling.  
It allows you to record, query, and connect the entire flow of play—from the high-level arcs of the world down to the fine-grained scenes of a session—under one consistent hierarchy.
