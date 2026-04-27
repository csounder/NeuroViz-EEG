#!/usr/bin/env python3
"""
Show parenthesis stack depth near line 12524
"""
import re

with open('index.html', 'r') as f:
    lines = f.readlines()

# Find the App function start
app_start = None
for i, line in enumerate(lines):
    if 'function App()' in line:
        app_start = i
        break

if app_start is None:
    print("Could not find App function")
    exit(1)

# Check parentheses balance and show depth around problem area
stack_depth = 0
for i in range(app_start, min(app_start + 8000, len(lines))):
    line = lines[i]
    # Skip strings to avoid counting parens in strings
    line_cleaned = re.sub(r'"[^"]*"', '', line)
    line_cleaned = re.sub(r"'[^']*'", '', line_cleaned)
    
    for char in line_cleaned:
        if char == '(':
            stack_depth += 1
        elif char == ')':
            stack_depth -= 1
    
    # Show depth for lines 12345-12530
    if 12345 <= i + 1 <= 12530:
        print(f"Line {i+1:5d} (depth={stack_depth:2d}): {lines[i].rstrip()}")
