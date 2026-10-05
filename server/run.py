import uvicorn

if __name__ == "__main__":
    print("Starting Nunchuk VR Relay Server on http://0.0.0.0:8000 ...")
    print("Virtual Controller URL: http://localhost:8000/static/virtual_pad.html")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
