import os
import subprocess
import sys


class RuntimeService:
    def select_folder(self, current_path: str | None = None) -> str | None:
        try:
            from tkinter import Tk, filedialog
        except Exception:
            return None

        root = Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        root.update()
        try:
            selected_path = filedialog.askdirectory(
                initialdir=current_path or None,
                title="Seleccionar carpeta del proyecto",
                mustexist=True,
            )
        except Exception:
            selected_path = None
        finally:
            root.destroy()

        return selected_path or None

    def open_folder(self, folder_path: str) -> bool:
        if not folder_path:
            return False

        os.makedirs(folder_path, exist_ok=True)

        try:
            if sys.platform.startswith("win"):
                os.startfile(folder_path)  # type: ignore[attr-defined]
                return True
            if sys.platform == "darwin":
                subprocess.Popen(["open", folder_path])
                return True
            subprocess.Popen(["xdg-open", folder_path])
            return True
        except Exception:
            return False


runtime_service = RuntimeService()
