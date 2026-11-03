"""Check, resize and compress uploaded photos."""
import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB (the browser already shrinks photos first)
MAX_SIDE = 1600  # px, longest side after resizing
JPEG_QUALITY = 82

Image.MAX_IMAGE_PIXELS = 50_000_000  # refuse absurdly large images


class ImageError(ValueError):
    pass


def process_upload(uploaded_file):
    """Return (jpeg_bytes, width, height). Raises ImageError with a readable message."""
    if uploaded_file.size > MAX_UPLOAD_BYTES:
        raise ImageError("Фото слишком большое (максимум 10 МБ).")
    try:
        img = Image.open(uploaded_file)
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise ImageError("Это не похоже на фото. Загрузите JPG, PNG или WEBP.")

    img = ImageOps.exif_transpose(img)  # fix rotation from phone cameras
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    out = io.BytesIO()
    # Saving fresh drops all metadata (EXIF, GPS location, camera info).
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return out.getvalue(), img.width, img.height
