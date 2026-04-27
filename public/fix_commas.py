#!/usr/bin/env python3
"""
Add missing commas after React view blocks in index.html
"""

with open('index.html', 'r') as f:
    lines = f.readlines()

# Lines that need commas added (closing parens for view blocks)
# These are the line numbers where `)` should become `),`
lines_to_fix = [
    8064,  # After dual mode
    8085,  # After quad mode
    8119,  # After timeline___OLD
    8139,  # After allbands
    8171,  # After topo
    8200,  # After traces
    8217,  # After mentalstate
]

# Make a backup
with open('index.html.prefixbackup', 'w') as f:
    f.writelines(lines)

# Fix each line
for line_num in lines_to_fix:
    idx = line_num - 1  # Convert to 0-indexed
    if idx < len(lines):
        line = lines[idx]
        # Only add comma if line ends with `)` and doesn't already have one
        if line.rstrip().endswith(')') and not line.rstrip().endswith('),'):
            lines[idx] = line.rstrip() + ',\n'
            print(f"Line {line_num}: Added comma")
        else:
            print(f"Line {line_num}: Skipped (already has comma or not a closing paren)")

# Write fixed file
with open('index.html', 'w') as f:
    f.writelines(lines)

print("Done!")
