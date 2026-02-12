import { Request, Response } from 'express';
import { DepartmentValue, StakeholderStatus, UserDesignation, UserRole } from '../constant';
import mongoose from 'mongoose';
import { User } from '../models/user';

interface CreateUserRequest {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    department: DepartmentValue;
    mobile: string;
    designation: UserDesignation;
    status: StakeholderStatus;
    password: string;
    role: UserRole;
}


interface UserResponse {
    _id: string;
    username: string;
    role: string;
}

interface SuccessResponse {
    message: string;
    user: UserResponse;
}

interface ErrorResponse {
    message: string;
}


export const AddUser = async (
  req: Request<{}, {}, CreateUserRequest>,
  res: Response<SuccessResponse | ErrorResponse>
) => {
  try {
    const { _id, name, email, department, mobile, designation, status, password, role } = req.body;

    if (!_id || !name || !email || !department || !mobile || !designation || !status || !password || !role) {
      return res.status(400).json({
        message: "All fields including _id are required"
      });
    }
    const existingId = await User.findById(_id);
    if (existingId) {
      return res.status(409).json({
        message: "User with this ID already exists"
      });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({
        message: "User with this email already exists"
      });
    }

    const user = await User.create({
      _id,
      name,
      email,
      department,
      mobile,
      designation,
      status,
      password,
      role
    });

    const response: UserResponse = {
      _id: user._id.toString(),
      username: user.name,
      role: user.role
    };

    return res.status(201).json({
      message: "User created successfully",
      user: response
    });

  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};
