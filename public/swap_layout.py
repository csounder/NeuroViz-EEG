#!/usr/bin/env python3
"""
Swap the layout: put displays on left, sidebar on right
"""

with open('index.html', 'r') as f:
    lines = f.readlines()

# Section boundaries (1-indexed line numbers, convert to 0-indexed)
sidebar_start = 7461 - 1  # h( for sidebar
sidebar_end = 7689 - 1    # ), that closes sidebar
display_start = 7694 - 1  # h( for right display area  
display_end = 12318 - 1   # ), that closes right display area

# Extract sections
before_layout = lines[:sidebar_start]
sidebar_section = lines[sidebar_start:sidebar_end+1]
between_sections = lines[sidebar_end+1:display_start]
display_section = lines[display_start:display_end+1]
after_layout = lines[display_end+1:]

# Update sidebar styling: borderRight -> borderLeft, and comment
sidebar_section_updated = []
for line in sidebar_section:
    # Update comment
    if 'LEFT SIDEBAR' in line:
        line = line.replace('LEFT SIDEBAR', 'RIGHT SIDEBAR')
    # Update border
    if 'borderRight:' in line:
        line = line.replace('borderRight:', 'borderLeft:')
    sidebar_section_updated.append(line)

# Update display section comment
display_section_updated = []
for line in display_section:
    if 'RIGHT DISPLAY AREA' in line:
        line = line.replace('RIGHT DISPLAY AREA', 'LEFT DISPLAY AREA')
    display_section_updated.append(line)

# Rebuild: displays first, then sidebar
new_lines = (
    before_layout +
    display_section_updated +
    between_sections +
    sidebar_section_updated +
    after_layout
)

with open('index.html', 'w') as f:
    f.writelines(new_lines)

print("Layout swapped successfully!")
print(f"- Display area (was lines {display_start+1}-{display_end+1}) now comes first")
print(f"- Sidebar (was lines {sidebar_start+1}-{sidebar_end+1}) now comes second")
