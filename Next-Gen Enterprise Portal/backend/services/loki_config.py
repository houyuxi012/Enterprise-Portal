"""
Loki Configuration Sync Service

Syncs access log retention settings from database to Loki configuration.
Note: Changes require Loki container restart to take effect.
"""

import os
import re
import logging

logger = logging.getLogger(__name__)

# Path to Loki config - mounted via docker-compose
LOKI_CONFIG_PATH = os.getenv("LOKI_CONFIG_PATH", "/app/loki/loki-config.yaml")

def update_loki_retention(retention_days: int) -> bool:
    """
    Update retention_period in Loki config file.
    
    Args:
        retention_days: Number of days to retain access logs
        
    Returns:
        True if config was updated, False otherwise
    """
    try:
        if not os.path.exists(LOKI_CONFIG_PATH):
            logger.warning(f"Loki config not found at {LOKI_CONFIG_PATH}")
            return False
        
        with open(LOKI_CONFIG_PATH, 'r') as f:
            config_content = f.read()
        
        # Convert days to hours for Loki format
        retention_hours = retention_days * 24
        new_retention = f"{retention_hours}h"
        
        # Update retention_period in limits_config
        # Match pattern: retention_period: XXXh
        pattern = r'(retention_period:\s*)\d+h'
        replacement = f"\\g<1>{new_retention}"
        
        updated_content = re.sub(pattern, replacement, config_content)
        
        # Also update reject_old_samples_max_age
        pattern2 = r'(reject_old_samples_max_age:\s*)\d+h'
        replacement2 = f"\\g<1>{new_retention}"
        updated_content = re.sub(pattern2, replacement2, updated_content)
        
        if updated_content != config_content:
            with open(LOKI_CONFIG_PATH, 'w') as f:
                f.write(updated_content)
            logger.info(f"Loki retention updated to {retention_days} days ({new_retention})")
            return True
        else:
            logger.info("Loki config unchanged - retention already set correctly")
            return True
            
    except Exception as e:
        logger.error(f"Failed to update Loki config: {e}")
        return False


def get_loki_retention() -> int:
    """
    Read current retention_period from Loki config.
    
    Returns:
        Retention period in days, or default 7 if not found
    """
    try:
        if not os.path.exists(LOKI_CONFIG_PATH):
            return 7
        
        with open(LOKI_CONFIG_PATH, 'r') as f:
            config_content = f.read()
        
        # Find retention_period value
        match = re.search(r'retention_period:\s*(\d+)h', config_content)
        if match:
            hours = int(match.group(1))
            return hours // 24
        
        return 7
        
    except Exception as e:
        logger.error(f"Failed to read Loki config: {e}")
        return 7
