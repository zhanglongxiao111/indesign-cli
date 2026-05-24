# InDesign MCP Server - LLM Instructions

## Overview

The InDesign MCP Server provides programmatic access to Adobe InDesign through Model Context Protocol (MCP). This allows LLMs to create, edit, and manage InDesign documents, pages, text, graphics, styles, and more.

## Setup Requirements

### Prerequisites

- **Adobe InDesign**: Must be installed and running on macOS
- **Node.js**: Version 16 or higher
- **macOS**: Required for AppleScript integration

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd indesign-cli

# Install dependencies
npm install

# Start the server
node src/index.js
```

### MCP Configuration

Add to your MCP client configuration:
```json
{
  "mcpServers": {
    "indesign": {
      "command": "node",
      "args": ["/path/to/indesign-cli/src/index.js"],
      "env": {}
    }
  }
}
```

## Available Tools

### Document Management

- `create_document` - Create new InDesign documents
- `open_document` - Open existing documents
- `save_document` - Save documents
- `close_document` - Close documents
- `get_document_info` - Get document properties

### Page Management

- `add_page` - Add new pages
- `delete_page` - Remove pages
- `navigate_to_page` - Switch to specific page
- `get_page_info` - Get page properties
- `set_page_background` - Set page background color

### Text Operations

- `create_text_frame` - Create text frames with content
- `edit_text_frame` - Modify existing text frames
- `get_text_info` - Get text frame properties
- `apply_paragraph_style` - Apply paragraph styles
- `apply_character_style` - Apply character styles

### Graphics & Images

- `create_rectangle` - Create rectangular shapes
- `create_ellipse` - Create elliptical shapes
- `create_polygon` - Create polygonal shapes
- `place_image` - Place images with scaling options
- `get_image_info` - Get image properties

### Styles & Colors

- `create_color_swatch` - Create custom colors
- `list_color_swatches` - List available colors
- `create_paragraph_style` - Create paragraph styles
- `create_character_style` - Create character styles
- `create_object_style` - Create object styles
- `list_styles` - List available styles

### Layout & Positioning

- `create_group` - Group multiple objects
- `ungroup` - Ungroup objects
- `create_master_spread` - Create master pages
- `apply_master_spread` - Apply master to pages

### Export & Utilities

- `export_pdf` - Export to PDF
- `export_images` - Export pages as images
- `execute_indesign_code` - Run custom ExtendScript

## Best Practices

### 1. Session Management

- Always create a document before adding content
- Use `navigate_to_page` to ensure you're on the correct page
- Save documents regularly with `save_document`

### 2. Positioning & Layout

- Use the session manager for smart positioning
- Respect page margins and boundaries
- Use consistent spacing and alignment

### 3. Style Application

- Create styles before applying them to content
- Use paragraph styles for consistent typography
- Apply character styles for inline formatting

### 4. Image Handling

- Use absolute file paths for images
- Consider scaling and fit modes for optimal placement
- Link images for better file management

### 5. Error Handling

- Check tool responses for success/failure
- Handle missing fonts or resources gracefully
- Validate parameters before tool calls

## Common Workflows

### Creating a Simple Document

```javascript
// 1. Create document
await tools.call("create_document", {
  name: "My Document",
  width: 210,
  height: 297,
  facingPages: false
});

// 2. Add text
await tools.call("create_text_frame", {
  content: "Hello World",
  x: 25,
  y: 25,
  width: 160,
  height: 50,
  fontSize: 24,
  fontName: "Arial\\tBold"
});

// 3. Save document
await tools.call("save_document", {
  filePath: "./output.indd"
});
```

### Creating a Branded Document

```javascript
// 1. Create document
await tools.call("create_document", {
  name: "Brand Document",
  width: 210,
  height: 297
});

// 2. Create brand colors
await tools.call("create_color_swatch", {
  name: "Brand Blue",
  colorType: "PROCESS",
  red: 0,
  green: 114,
  blue: 198
});

// 3. Create paragraph styles
await tools.call("create_paragraph_style", {
  name: "Heading 1",
  fontName: "Arial\\tBold",
  fontSize: 32,
  fillColor: "Brand Blue"
});

// 4. Add styled content
await tools.call("create_text_frame", {
  content: "Company Name",
  x: 25,
  y: 25,
  width: 160,
  height: 40,
  paragraphStyle: "Heading 1"
});
```

### Creating a Multi-Page Layout

```javascript
// 1. Create document
await tools.call("create_document", {
  name: "Multi-Page Layout",
  width: 210,
  height: 297
});

// 2. Add pages
for (let i = 0; i < 4; i++) {
  await tools.call("add_page", { position: "AT_END" });
}

// 3. Create content for each page
for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
  await tools.call("navigate_to_page", { pageIndex });
  
  await tools.call("create_text_frame", {
    content: `Page ${pageIndex + 1}`,
    x: 25,
    y: 25,
    width: 160,
    height: 30,
    fontSize: 18,
    fontName: "Arial\\tBold"
  });
}
```

### Working with Images

```javascript
// 1. Place image with scaling
await tools.call("place_image", {
  filePath: "/absolute/path/to/image.jpg",
  x: 25,
  y: 25,
  width: 100,
  height: 75,
  scale: 150,
  fitMode: "PROPORTIONALLY"
});

// 2. Create object style for images
await tools.call("create_object_style", {
  name: "Image Frame",
  strokeColor: "Black",
  strokeWeight: 1
});

// 3. Apply style to image
await tools.call("apply_object_style", {
  objectName: "Image Frame"
});
```

## Advanced Features

### Smart Positioning

The server includes a session manager that provides:
- Automatic bounds checking
- Smart positioning calculations
- Page dimension awareness
- Margin and spacing management

### Style System

- Create comprehensive style libraries
- Apply consistent typography
- Maintain brand guidelines
- Support for paragraph, character, and object styles

### Image Scaling

- Precise scale control (1% to 1000%)
- Multiple fit modes (PROPORTIONALLY, FILL_FRAME, FIT_CONTENT, FIT_FRAME)
- Automatic aspect ratio preservation
- Frame size optimization

### Error Handling

- Graceful handling of missing resources
- Detailed error messages
- Fallback options for fonts and colors
- Validation of parameters and constraints

## Troubleshooting

### Common Issues

1. **"No document open"** - Create a document first
2. **"Font not found"** - Use available fonts or provide fallbacks
3. **"Image file not found"** - Use absolute file paths
4. **"Page out of bounds"** - Check positioning parameters

### Debug Tips

- Use `get_document_info` to check document state
- Use `list_color_swatches` to see available colors
- Use `list_styles` to see available styles
- Check tool responses for detailed error messages

## Integration Examples

### With Claude/GPT

```javascript
// Example: Create a professional report
const reportData = {
  title: "Q4 Sales Report",
  sections: ["Overview", "Results", "Analysis", "Recommendations"]
};

// Create document structure
await tools.call("create_document", {
  name: reportData.title,
  width: 210,
  height: 297
});

// Add title page
await tools.call("create_text_frame", {
  content: reportData.title,
  x: 25,
  y: 100,
  width: 160,
  height: 50,
  fontSize: 36,
  fontName: "Arial\\tBold",
  alignment: "CENTER"
});

// Add sections
for (let i = 0; i < reportData.sections.length; i++) {
  await tools.call("add_page", { position: "AT_END" });
  await tools.call("navigate_to_page", { pageIndex: i + 1 });
  
  await tools.call("create_text_frame", {
    content: reportData.sections[i],
    x: 25,
    y: 25,
    width: 160,
    height: 30,
    fontSize: 24,
    fontName: "Arial\\tBold"
  });
}
```

### With Custom Applications

```javascript
// Example: Batch document creation
const documents = [
  { name: "Document 1", content: "Content for doc 1" },
  { name: "Document 2", content: "Content for doc 2" },
  { name: "Document 3", content: "Content for doc 3" }
];

for (const doc of documents) {
  await tools.call("create_document", {
    name: doc.name,
    width: 210,
    height: 297
  });
  
  await tools.call("create_text_frame", {
    content: doc.content,
    x: 25,
    y: 25,
    width: 160,
    height: 247
  });
  
  await tools.call("save_document", {
    filePath: `./${doc.name}.indd`
  });
  
  await tools.call("close_document");
}
```

## Performance Considerations

### Optimization Tips

- Batch operations when possible
- Reuse styles and colors
- Minimize page navigation
- Use appropriate image formats and sizes

### Memory Management

- Close documents when done
- Clear session data if needed
- Monitor file sizes for large documents
- Use linking for large images

## Security Notes

### File Access

- Use absolute paths for file operations
- Validate file paths before use
- Handle file permissions appropriately
- Consider sandboxing for untrusted content

### Resource Management

- Limit concurrent operations
- Monitor system resources
- Handle timeouts gracefully
- Clean up temporary files

## Support & Resources

### Documentation

- InDesign ExtendScript API: https://www.indesignjs.de/extendscriptAPI/
- MCP Protocol: https://modelcontextprotocol.io/
- Node.js Documentation: https://nodejs.org/docs/

### Community

- GitHub Issues for bug reports
- Feature requests and contributions welcome
- Examples and use cases encouraged

---

**Note**: This MCP server is designed for macOS with Adobe InDesign. Ensure all prerequisites are met before use. For production environments, consider implementing additional error handling and validation.
