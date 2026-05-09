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


runtime_service = RuntimeService()
