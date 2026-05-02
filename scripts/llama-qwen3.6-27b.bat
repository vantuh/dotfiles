@echo off
.\llama-server.exe -m .\models\Qwen3.6-27B-UD-IQ3_XXS.gguf -ngl 99 -c 65536 --cache-type-k q4_0 --cache-type-v q4_0 --flash-attn on -t 8 --port 8080
