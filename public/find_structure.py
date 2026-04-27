#!/usr/bin/env python3
"""
Find the h() call structure and identify the closing issues
"""
import re

with open('index.html', 'r') as f:
    lines = f.readlines()

# Find the App function
app_start = None
for i, line in enumerate(lines):
    if 'function App()' in line:
        app_start = i
        break

# Find the return statement
return_line = None
for i in range(app_start, min(app_start + 2000, len(lines))):
    if 'return h(' in lines[i]:
        return_line = i
        break

print(f"App starts at line {app_start + 1}")
print(f"Return statement at line {return_line + 1}")

# Check the comments that describe structure
structural_comments = [
    "top-level container",
    "MAIN LAYOUT",
    "LEFT SIDEBAR",
    "RIGHT DISPLAY AREA",
    "CONTENT AREA",
]

for comment in structural_comments:
    for i in range(return_line, min(return_line + 6000, len(lines))):
        if comment in lines[i]:
            print(f"Line {i+1}: {lines[i].rstrip()}")
            break

# Now find all the closing comments
print("\nClosing comments:")
for i in range(return_line, min(return_line + 8000, len(lines))):
    if 'Close' in lines[i] and '//' in lines[i]:
        print(f"Line {i+1}: {lines[i].rstrip()}")
