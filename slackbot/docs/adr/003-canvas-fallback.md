# ADR-003: Canvas with File Fallback

## Status

Accepted

## Context

During the review phase, Regent synthesizes the conversation into a structured specification
document. We needed to deliver this document to the team in a way that:

1. **Easy to Review**: Team members can read and discuss the spec
2. **Editable**: Feedback can be incorporated iteratively
3. **Accessible**: Works across different Slack workspace configurations
4. **Persistent**: Spec remains available after the session

Options considered:

- **Canvas Only**: Use Slack Canvas for all spec delivery
- **File Upload Only**: Always upload as a markdown file
- **Canvas with Fallback**: Try Canvas, fall back to file on failure
- **External Link**: Host spec on external service (GitHub Gist, etc.)

## Decision

We chose **Canvas as the primary delivery mechanism with file upload fallback**.

The process:

1. Attempt to create a Slack Canvas with the spec content
2. If Canvas creation succeeds, post the Canvas link to the thread
3. If Canvas creation fails, upload `brainstorm.md` as a file attachment
4. Continue the review process with whichever format succeeded

Rationale:

1. **Canvas Benefits**:
   - Native Slack experience
   - Rich formatting support
   - Collaborative editing
   - Inline commenting potential

2. **File Fallback Benefits**:
   - Works in all workspaces
   - No special permissions required
   - Standard markdown format
   - Downloadable for external use

3. **Graceful Degradation**: Never blocks the workflow due to Canvas issues

## Consequences

### Positive

- **Works Everywhere**: File fallback ensures functionality in all workspaces
- **Best Experience When Available**: Canvas provides superior UX when it works
- **No Configuration Required**: Automatic detection and fallback
- **Consistent Content**: Same markdown content in both formats

### Negative

- **Dual Code Paths**: Must maintain both Canvas and file upload logic
  - CanvasManager handles both paths
  - Tested independently

- **UX Inconsistency**: Users may get different experiences in different workspaces
  - Acceptable: both formats support the review workflow
  - File format is self-explanatory

- **Canvas Limitations**: Not all markdown features render identically
  - Spec format designed for compatibility
  - Core content always readable

### Error Handling

Canvas creation can fail for several reasons:

```typescript
// SlackCanvasError is classified as Transient but triggers fallback
try {
  const canvas = await canvasManager.createCanvas(spec);
  return { type: "canvas", id: canvas.id };
} catch (error) {
  if (error instanceof SlackCanvasError) {
    const file = await canvasManager.uploadFile(spec);
    return { type: "file", id: file.id };
  }
  throw error;
}
```

### User Communication

When fallback occurs, the user is informed:

```
Canvas creation was not available. The specification has been uploaded as a file.
Please review brainstorm.md attached to this thread.
```

### Related Properties

- **Property 5 (Spec Delivery)**: Canvas/file delivery satisfies spec visibility
- **Property 10 (Error Disclosure)**: Fallback is communicated to users
