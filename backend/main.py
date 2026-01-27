from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import employees, news, tools, announcements, ai, auth, users

app = FastAPI(title="ShiKu Portal API", version="1.0.0")

# CORS middleware to allow calls from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to ShiKu Portal API"}

# Include Routers
app.include_router(employees.router)
app.include_router(news.router)
app.include_router(tools.router)
app.include_router(announcements.router)
app.include_router(ai.router)
app.include_router(auth.router)
app.include_router(users.router)
