"""Configuration management for SRS tool."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union

import yaml


@dataclass
class Config:
    """Application configuration."""

    # Paths
    vault_path: str = ""
    database_path: str = "./srs.db"
    drafts_folder: str = "Drafts"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # S3
    s3_bucket: Optional[str] = None
    s3_region: str = "us-east-1"

    # OpenAI
    openai_model: str = "gpt-4o"
    openai_max_tokens: int = 4096

    # FSRS
    target_retention: float = 0.9
    maximum_interval: int = 365

    @classmethod
    def load(cls, config_path: Optional[Union[str, Path]] = None) -> "Config":
        """Load configuration from YAML file.

        Searches for config in order:
        1. Explicit path if provided
        2. ./srs.yaml
        3. ~/.config/srs/config.yaml
        """
        search_paths = []

        if config_path:
            search_paths.append(Path(config_path))

        search_paths.extend([
            Path("./srs.yaml"),
            Path.home() / ".config" / "srs" / "config.yaml",
        ])

        for path in search_paths:
            if path.exists():
                return cls._load_from_file(path)

        return cls()

    @classmethod
    def _load_from_file(cls, path: Path) -> "Config":
        """Load config from a specific file."""
        with open(path) as f:
            data = yaml.safe_load(f) or {}

        return cls(
            vault_path=data.get("vault_path", ""),
            database_path=data.get("database_path", "./srs.db"),
            drafts_folder=data.get("drafts_folder", "Drafts"),
            host=data.get("host", "0.0.0.0"),
            port=data.get("port", 8000),
            s3_bucket=data.get("s3_bucket"),
            s3_region=data.get("s3_region", "us-east-1"),
            openai_model=data.get("openai_model", "gpt-4o"),
            openai_max_tokens=data.get("openai_max_tokens", 4096),
            target_retention=data.get("target_retention", 0.9),
            maximum_interval=data.get("maximum_interval", 365),
        )

    def save(self, path: Union[str, Path]):
        """Save configuration to a YAML file."""
        data = {
            "vault_path": self.vault_path,
            "database_path": self.database_path,
            "drafts_folder": self.drafts_folder,
            "host": self.host,
            "port": self.port,
            "s3_bucket": self.s3_bucket,
            "s3_region": self.s3_region,
            "openai_model": self.openai_model,
            "openai_max_tokens": self.openai_max_tokens,
            "target_retention": self.target_retention,
            "maximum_interval": self.maximum_interval,
        }

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False)
