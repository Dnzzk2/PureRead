import zipfile
import os
import json

def build_release():
    # 从 manifest 获取版本号
    with open('manifest.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
        version = manifest['version']

    # 包含文件列表
    include_files = [
        'manifest.json', 'background.js', 'content.js', 'popup.js', 
        'shared.js', 'popup.html', 'options.html', 'options.js', 'icon.png'
    ]
    
    output_filename = f'PureRead-v{version}.zip'
    
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in include_files:
            if os.path.exists(file):
                zipf.write(file)
                print(f"Added: {file}")
    
    print(f"\nSuccessfully created: {output_filename}")

if __name__ == "__main__":
    build_release()