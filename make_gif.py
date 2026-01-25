import sys
from PIL import Image

def create_gif(input_path, output_path, num_frames=5):
    try:
        # Open source image
        img = Image.open(input_path)
        width, height = img.size
        
        # Calculate frame width
        frame_width = width // num_frames
        
        frames = []
        for i in range(num_frames):
            # Crop frame
            left = i * frame_width
            right = (i + 1) * frame_width
            # Define box (left, upper, right, lower)
            box = (left, 0, right, height)
            frame = img.crop(box)
            frames.append(frame)
            
        # Optimize: Resize if output is huge (optional, but requested "optimized enough")
        # Let's resize height to 400px to make it clear but small
        target_height = 400
        aspect_ratio = frames[0].width / frames[0].height
        target_width = int(target_height * aspect_ratio)
        
        resized_frames = [f.resize((target_width, target_height), Image.Resampling.LANCZOS) for f in frames]
        
        # Save as GIF
        resized_frames[0].save(
            output_path,
            save_all=True,
            append_images=resized_frames[1:],
            optimize=True,
            duration=600, # 0.6s per frame - slightly slower for clarity
            loop=0
        )
        print(f"Successfully created GIF at {output_path}")
        
    except Exception as e:
        print(f"Error creating GIF: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python make_gif.py <input_path> <output_path> [num_frames]")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    num_frames = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    
    create_gif(input_path, output_path, num_frames)
