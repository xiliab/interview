import os
import json
import subprocess
import wave

site_dir = "/Users/xiliab/Desktop/开发/面试/interview-podcast-site"
dialogues_file = os.path.join(site_dir, "public/data/dialogues.json")
episodes_file = os.path.join(site_dir, "public/data/episodes.json")
audio_dir = os.path.join(site_dir, "public/audio")

# 1. 确保音频存放目录存在
os.makedirs(audio_dir, exist_ok=True)

with open(dialogues_file, 'r', encoding='utf-8') as f:
    dialogues = json.load(f)

with open(episodes_file, 'r', encoding='utf-8') as f:
    episodes = json.load(f)

# 找出所有的 Deep-dive 题目作为生成目标
deep_dive_ids = [ep["id"] for ep in episodes if ep["type"] == "Deep-dive"]

print(f"Target Deep-dive episodes count: {len(deep_dive_ids)}")

# 发音人映射
speaker_voices = {
    "男声": "Reed",
    "女声": "Tingting"
}

def generate_episode_audio(episode_id, turns):
    output_m4a = os.path.join(audio_dir, f"{episode_id}.m4a")
    
    # 增量检查：如果已经生成了，跳过
    if os.path.exists(output_m4a):
        print(f"  Audio for {episode_id} already exists. Skipping.")
        return True
        
    print(f"  Generating audio for {episode_id}...")
    temp_wavs = []
    
    # 逐句生成临时 pcm WAV
    for idx, turn in enumerate(turns):
        speaker = turn["speaker"]
        line = turn["line"]
        voice = speaker_voices.get(speaker, "Tingting")
        
        temp_file = os.path.join(site_dir, f"temp_{episode_id}_{idx}.wav")
        temp_wavs.append(temp_file)
        
        # 运行 macOS say 命令行进行 TTS
        cmd = [
            "say",
            "-v", voice,
            line,
            "--file-format=WAVE",
            "--data-format=LEI16@22050",
            "-o", temp_file
        ]
        
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError as e:
            print(f"    Failed to run say for turn {idx} of {episode_id}: {e}")
            # 清理已生成的临时文件并退出
            clean_temp_files(temp_wavs)
            return False
            
    # 合并临时 pcm WAV 文件
    combined_wav = os.path.join(site_dir, f"temp_{episode_id}_combined.wav")
    try:
        data = []
        params = None
        for f in temp_wavs:
            if not os.path.exists(f):
                continue
            with wave.open(f, "rb") as w:
                data.append(w.readframes(w.getnframes()))
                params = w.getparams()
                
        if not data or not params:
            raise ValueError("No audio frames collected to merge")
            
        with wave.open(combined_wav, "wb") as out:
            out.setparams(params)
            for d in data:
                out.writeframes(d)
                
    except Exception as e:
        print(f"    Failed to merge WAV files for {episode_id}: {e}")
        clean_temp_files(temp_wavs + [combined_wav])
        return False
        
    # 用 afconvert 把合并后的无压缩 WAV 转成高质量 M4A
    convert_cmd = [
        "afconvert",
        "-f", "m4af",
        "-d", "aac",
        combined_wav,
        output_m4a
    ]
    
    success = False
    try:
        subprocess.run(convert_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        success = True
    except subprocess.CalledProcessError as e:
        print(f"    Failed to convert WAV to M4A for {episode_id}: {e}")
    finally:
        # 清理所有的临时临时文件
        clean_temp_files(temp_wavs + [combined_wav])
        
    return success

def clean_temp_files(files):
    for f in files:
        if os.path.exists(f):
            try:
                os.remove(f)
            except:
                pass

def main():
    success_count = 0
    failed_count = 0
    
    for idx, ep_id in enumerate(deep_dive_ids):
        if ep_id not in dialogues:
            print(f"Warning: {ep_id} not found in dialogues.json")
            continue
            
        turns = dialogues[ep_id]["turns"]
        print(f"[{idx+1}/{len(deep_dive_ids)}] Processing {ep_id}...")
        
        ok = generate_episode_audio(ep_id, turns)
        if ok:
            success_count += 1
        else:
            failed_count += 1
            
    print("\n--- Audio Generation Report ---")
    print(f"Success/Skipped count: {success_count}")
    print(f"Failed count: {failed_count}")
    
    # 自动刷新音频清单并重新打包静态网页
    print("\nRefreshing audio manifest...")
    subprocess.run(["node", "scripts/build-audio-manifest.mjs"], cwd=site_dir)
    print("Rebuilding static site...")
    subprocess.run(["npm", "run", "build"], cwd=site_dir)

if __name__ == "__main__":
    main()
