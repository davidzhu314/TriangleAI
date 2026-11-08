"""Run the D5 physics process: `MUJOCO_GL=disable .venv/bin/python -m server` from physics/."""
import argparse
import asyncio
import json
import os
import sys

from server.app import DEFAULT_PORT, HOST, serve


async def main(args) -> None:
    if os.environ.get("MUJOCO_GL") != "disable":
        sys.exit("Set MUJOCO_GL=disable (the server never renders; see physics/README.md).")
    from server.cathsim_backend import CathSimBackend

    CathSimBackend()  # import CathSim now (about 20 s) so the first drive starts quickly
    server = await serve(args.port, backend_factory=CathSimBackend)
    print(json.dumps({"cases": f"http://{HOST}:{args.port}/cases/index.json", "wire": f"ws://{HOST}:{args.port}/wire"}), flush=True)
    try:
        if args.seconds:
            await asyncio.sleep(args.seconds)
        else:
            await asyncio.Future()
    finally:
        server.close()
        await server.wait_closed()
        stats = server.stats
        for k, v in stats.items():
            v = sorted(v)
            if v:
                print(json.dumps({k: {"n": len(v), "p50": round(v[len(v) // 2], 2), "p95": round(v[int(len(v) * 0.95)], 2), "max": round(v[-1], 2)}}), flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="ThreadSim physics process (CathSim), localhost only")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--seconds", type=float, default=0, help="exit after this long (0 = run until stopped)")
    asyncio.run(main(ap.parse_args()))
