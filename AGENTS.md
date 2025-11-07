# Rules for AI Assistants

**IF YOU ARE AN AI ASSISTANT YOU MUST FOLLOW THESE RULES**

## Standard Development Workflow

1. If you are working on a component of the application, first read the design doc for that component in docs/components and any other related component required for the task. For instance, the design doc for a Lambda function that implements the method "foo" should be located at docs/components/foo.md.

2. Always update the appropriate README or the appropriate design document when you make a change that impacts the contents of these documents.

3. Do not create additional markdown files in the repository unless you are instructed explicitly to.

4. As you make changes, you must commit them grouped by single logical purpose, typically under 150 lines of source code plus 150 lines of test code. For larger changes, break them into multiple commits that each follow this principle.

5. Commit your changes in git using a well-formed commit message consisting of a single sentence summary and no more than a few paragraphs explaining the change and your testing. After this explanation, place the prompt the user used to trigger this work prefixed with a "Prompt: " after a single line consisting of '---'. Make sure there are no empty lines before or after this line. Word wrap all paragraphs at 72 columns including the prompt.

6. When working on unit tests, write tests that will fail with clear errors (e.g. use `result.unwrap()`, instead of `assert!(result.is_ok())`).

7. Avoid unit tests that test too much, prefer tests that test small piece of functionality.

For detailed guidance on specific tasks, refer to the skills in `docs/skills/`.

**ALWAYS FOLLOW THESE RULES WHEN YOU WORK IN THIS PROJECT**

