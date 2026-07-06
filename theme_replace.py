import os
import re

directory = r'f:\boardroom-ai\frontend\src'

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content
    
    # Gradient replacements
    new_content = re.sub(r'from-indigo-\d+ to-purple-\d+', 'from-blue-600 to-blue-800', new_content)
    new_content = re.sub(r'from-indigo-600 to-purple-600', 'from-blue-600 to-blue-800', new_content)
    new_content = re.sub(r'from-indigo-500/20 to-purple-600/20', 'from-blue-600/20 to-blue-800/20', new_content)
    new_content = re.sub(r'from-blue-500 to-indigo-600', 'from-blue-500 to-blue-700', new_content)
    new_content = re.sub(r'to-indigo-500', 'to-blue-600', new_content)
    new_content = re.sub(r'to-violet-500', 'to-blue-700', new_content)
    new_content = re.sub(r'from-slate-\d+ to-slate-\d+', 'from-slate-100 to-slate-200', new_content) # for grey avatars
    
    # Generic replacements
    new_content = re.sub(r'indigo', 'blue', new_content)
    new_content = re.sub(r'purple', 'blue', new_content)
    
    if content != new_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(filepath)}")

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts') or file.endswith('.css'):
            process_file(os.path.join(root, file))

print("Done replacing colors.")
