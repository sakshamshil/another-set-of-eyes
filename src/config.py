from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Environment
    environment: str = "development"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = ""

    # Phrase hashing — REQUIRED in production. Used as PBKDF2 salt so DB dump alone can't crack phrases.
    phrase_secret: str = ""

    # GitHub API
    github_token: str = ""
    github_repo: str = "sakshamshil/another-set-of-eyes-docs"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
