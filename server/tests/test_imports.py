#!/usr/bin/env python
"""Test batch API imports"""
try:
    from app.api.batches import router
    from app.core.models import Batch, BatchFileInfo, BatchResponse
    from app.core.storage import save_batch, load_batch
    print("All imports successful!")
    print(f"Router: {router}")
except Exception as e:
    print(f"Import error: {e}")
    import traceback
    traceback.print_exc()
