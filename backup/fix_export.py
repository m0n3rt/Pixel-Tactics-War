import re

# 读取文件
with open('game_single.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到导出语句
export_pattern = r'export \{([^}]+)\};'
match = re.search(export_pattern, content)
if match:
    # 提取所有导出的变量名
    export_content = match.group(1)
    variables = [v.strip() for v in export_content.split(',')]
    
    # 生成全局变量赋值代码
    global_assignments = '\n'.join([f'THREE.{var} = {var};' for var in variables])
    
    # 将导出语句替换为全局变量赋值
    replacement = f'''// THREE.js exports - assigning to global THREE object
{global_assignments}'''
    
    content = content.replace(match.group(0), replacement)
    
    # 写入文件
    with open('game_single.html', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f'Successfully converted {len(variables)} exports to global THREE assignments')
else:
    print('Export statement not found')