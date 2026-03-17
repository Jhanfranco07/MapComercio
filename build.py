#!/usr/bin/env python3
import os
import re

# Define the replacements
replacements = {
    '__GOOGLE_MAPS_API_KEY_INDEX__': os.getenv('GOOGLE_MAPS_API_KEY_INDEX', 'YOUR_API_KEY_HERE'),
    '__GOOGLE_MAPS_API_KEY_NEGOCIOS__': os.getenv('GOOGLE_MAPS_API_KEY_NEGOCIOS', 'YOUR_API_KEY_HERE'),
    '__GOOGLE_MAPS_API_KEY_VISOR__': os.getenv('GOOGLE_MAPS_API_KEY_VISOR', 'YOUR_API_KEY_HERE'),
}

# Files to process
files = ['index.html', 'negocios.html', 'visor_ambulantes.html']

for file in files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {file}')
    else:
        print(f'File {file} not found')