"""Build the generic plugin download without credentials or development files."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / "integrations/woocommerce/affimaro"
target = root / "public/downloads"
target.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target / "affimaro-woocommerce.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ("affimaro.php", "README.md"):
        info = zipfile.ZipInfo("affimaro/" + name, date_time=(2026, 10, 15, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (source / name).read_bytes())
(target / "woocommerce-setup.md").write_bytes((source / "README.md").read_bytes())
print("Built WooCommerce plugin ZIP and setup guide.")
