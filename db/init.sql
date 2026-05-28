-- db/init.sql

CREATE TABLE users (
                       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                       name VARCHAR(255) NOT NULL,
                       email VARCHAR(255) UNIQUE NOT NULL,
                       password_hash VARCHAR(255) NOT NULL,
                       phone VARCHAR(50),
                       role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'customer', 'carrier')),
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vehicles (
                          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                          carrier_id UUID REFERENCES users(id) ON DELETE CASCADE,
                          brand VARCHAR(100) NOT NULL,
                          model VARCHAR(100) NOT NULL,
                          vehicle_type VARCHAR(50) NOT NULL,
                          payload_tons DECIMAL(10, 2) NOT NULL,
                          license_plate VARCHAR(20) UNIQUE NOT NULL,
                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        cargo_type VARCHAR(255) NOT NULL,
                        cargo_description TEXT,
                        cargo_weight DECIMAL(10, 2) NOT NULL,
                        origin_address TEXT NOT NULL,
                        destination_address TEXT NOT NULL,
                        desired_date DATE NOT NULL,
                        desired_price DECIMAL(10, 2),
                        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'confirmed', 'completed', 'cancelled')),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposals (
                           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                           order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
                           carrier_id UUID REFERENCES users(id) ON DELETE CASCADE,
                           vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
                           price DECIMAL(10, 2) NOT NULL,
                           comment TEXT,
                           status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);