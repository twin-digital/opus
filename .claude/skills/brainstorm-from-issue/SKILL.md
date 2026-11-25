---
name: brainstorm-from-issue
description: Use when the user asks to brainstorm, settle, answer, or work through the open questions of a GitHub issue, or to prepare an issue for an OpenSpec change by closing its open questions.
---

# Brainstorm From Issue

## Overview

Settle the open questions of one GitHub issue with the owner. Present one question in each message. Record each decision on the issue immediately after the owner makes it, before you present the next question.

The issue is the only record. Do not create an OpenSpec change, a planning file, or code.

## Steps

1. **Read.** Read the issue body and each comment. Read each issue, specification, and document that the issue links to. Read the code that a question is about.
2. **List the questions.** Use the open questions of the issue, with their numbers. Skip a question that has a strikethrough, or that the issue marks as answered or moved. Keep to the scope that the user gave.
3. **Set aside each blocked question.** A question is blocked when its answer depends on work that is not settled in a different issue or pull request. Do not present it. Name it in the final report, with the work that blocks it. When only a part of a question is blocked, present the part that is not blocked.
4. **Give the order in one line**, at the top of the first message. Put a question before the questions that depend on its answer.
5. **Present one question.** Use the parts in "The message for one question". Then stop and wait for the owner.
6. **Discuss** until the owner gives an outcome: answered, deferred, or left open.
7. **Record the outcome** with the two writes in "The record". Do the two writes before you present the next question.
8. **Repeat** steps 5 to 7 for each question.
9. **Report.** List the answered questions, the deferred questions and where each one went, the questions left open, and the blocked questions.

## The message for one question

Each message has these parts, in this order:

| Part               | Contents                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**       | The number and the text of the question, as the issue gives it.                                                                                 |
| **Context**        | What is decided, what is built, and what constrains the answer. Give the source of each fact.                                                   |
| **Options**        | Each known reasonable answer, with its cost and its benefit. Include the options that the issue gives and any others the issue may have missed. |
| **Recommendation** | One option, with the reason. Or "Defer", with the destination.                                                                                  |

A deferral always names its destination: an existing issue, by number, or a new issue, with a proposed title. "Later" is not a destination. The user may choose to "decline" or "skip" the question, in which case it can be left open for the implementer of the ticket.

If the recommendation includes a decision that the question did not ask for, show it as a separate item. A general agreement from the owner, such as "agreed", confirms the recommendation and each separate item of that message.

## The record

Do these two writes for each question, in this order.

**1. Add one new comment to the issue.** Each question has its own comment. Do not add a decision to an earlier comment.

- The heading is `## Question <number>: <short title>`.
- State the decision as short bullets. A reader who did not see the conversation must understand it.
- If the repository defines status labels, use them. Mark a decision as confirmed only when the owner stated it or confirmed it. Mark your own additions that the owner did not confirm as proposed.
- For each rejected option, give one line that starts with "Rejected:" and gives the reason.
- For a deferred question, give the destination as a link, and the reason.
- For a question that is answered in part, state the part that is not answered and its destination.
- If the answer replaces other text of the issue body, quote that text in the comment. Do not change it in the body.
- If the owner changes a recorded decision later, add a new comment. Strike through the original comment. After the strikethrough, add a "revised in" link referencing the new comment.
- For a question that stays open, record what the discussion found. Do not strike it through.

**2. Strike through the question in the issue body.** Change only the item of that question.

- Fetch the body immediately before the edit. Do not use an earlier copy.
- Put `~~` before and after the full text of the item. Keep the number of the item.
- After the strikethrough, add `Answered in [this comment](<comment URL>).` or `Moved to [<issue title>](<issue URL>).`
- Compare the new body with the fetched body. The difference must be that one item. Then send the new body.

**A deferred question** also needs its destination to hold the question:

- An existing issue: add a comment there with the question, the context, and a link back.
- A new issue: create it only after the owner agrees. Follow the issue rules of the repository (type, labels, milestone, project board).

## Commands

In an environment with a token for each organization, put `GH_ORG=<org>` before each `gh` call. Write each body to a file in the scratchpad directory, so that quotes in the text cause no problem.

```bash
# Read the issue and its comments
gh issue view 123 -R OWNER/REPO --json title,body,comments

# Add the comment. The output is the comment URL.
gh issue comment 123 -R OWNER/REPO --body-file comment.md

# Fetch the body, edit the one item, compare, send
gh api repos/OWNER/REPO/issues/123 --jq .body > body-before.md
cp body-before.md body-after.md   # then edit body-after.md
diff body-before.md body-after.md
gh api --method PATCH repos/OWNER/REPO/issues/123 -F body=@body-after.md
```

## Example

The comment:

```markdown
## Question 3: The format of the export file

- The export file is one JSON file for each project. (**Agreed**)
- The file has a version field. (**Agreed**)
- A file with an unknown version is rejected with a message that names the version. (**Proposed**)

Rejected: one CSV file for each table. A reader cannot rebuild the relations between the tables.

Not answered here: the export of attachments. Moved to [Attachments](https://github.com/OWNER/REPO/issues/140).
```

The item in the issue body, after the edit:

```markdown
3. ~~**Which format does the export file have?** JSON and CSV are the candidates. ...~~ Answered in [this comment](https://github.com/OWNER/REPO/issues/123#issuecomment-1).
```

## Common mistakes

| Mistake                                                       | Correction                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Present two or more questions in one message                  | One question in each message. Give only the order of the others.             |
| One results comment that you update after each decision       | One new comment for each question.                                           |
| Edit the issue body one time, at the end                      | Strike through each question immediately after its comment.                  |
| Present the next question before the two writes are done      | Record first. A session that stops must lose no decision.                    |
| Correct other text of the issue body during the edit          | Change only the item of the question. Report other problems to the owner.    |
| Record your own extra decision as confirmed                   | Show it as a separate item. Mark it as proposed until the owner confirms it. |
| Recommend "defer" with no destination                         | Name the existing issue, or propose the title of a new issue.                |
| Present a question that waits on unsettled work elsewhere     | Set it aside. Name it and its blocker in the final report.                   |
| Start an OpenSpec change or edit a file during the brainstorm | The issue is the only record.                                                |
