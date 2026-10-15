# 删除重复的OrbitControls代码块

with open('game_single.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到第一个"Expose OrbitControls globally"之后的第二个OrbitControls块
first_expose_found = False
start_remove = -1
end_remove = -1

for i, line in enumerate(lines):
    if '// Expose OrbitControls globally' in line:
        if not first_expose_found:
            first_expose_found = True
        else:
            # 找到第二个暴露语句，记录结束位置（上一行）
            end_remove = i - 1
            break
    elif first_expose_found and start_remove == -1:
        # 在第一个暴露语句之后，找到第二个OrbitControls块的开始
        if '// OrbitControls - using global THREE variables' in line:
            start_remove = i

print(f"Found duplicate OrbitControls block from line {start_remove+1} to {end_remove+1}")

# 删除重复的块
if start_remove > 0 and end_remove > start_remove:
    del lines[start_remove:end_remove+1]
    print(f"Successfully removed {end_remove - start_remove + 1} lines")
    
    # 写入文件
    with open('game_single.html', 'w', encoding='utf-8') as f:
        f.writelines(lines)
else:
    print("Could not find duplicate OrbitControls block")