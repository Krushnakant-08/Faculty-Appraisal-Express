import { Request, Response } from 'express';
import { User } from '../models/user';
import InteractionDean from '../models/interactionDean';
import { hashPassword } from '../utils/password';

interface ExternalFacultyInput {
  full_name: string;
  mail: string;
  mob: string;
  desg?: string;
  specialization?: string;
  organization?: string;
  address?: string;
  assignedDean?: string;
  assignedFaculties?: string[];
}

/**
 * Create external faculty for a department
 * POST /api/hod/:department/create-external
 */
export const createExternal = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const { full_name, mail, mob, desg, specialization, organization, address, assignedDean, assignedFaculties }: ExternalFacultyInput = req.body;

    // Validate required fields
    if (!full_name || !mail || !mob || !specialization || !organization || !address) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Validate mobile number have 10 digits
    if (mob.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must have 10 digits',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: mail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // Generate userId for external faculty using EXT + last 4 digits of mobile
    const last4Digits = mob.slice(-4);
    const userId = `EXT${last4Digits}`;

    // Hash the userId to use as password
    const hashedPassword = await hashPassword(userId);

    // Create new external faculty user (password is same as userId)
    const externalFaculty = new User({
      userId,
      name: full_name,
      email: mail,
      mobile: mob,
      role: 'external',
      status: 'active',
      password: hashedPassword,
      department: department,
      specialization: specialization || '',
      organization: organization || '',
      address: address || '',
      externalDesignation: desg || '',
      assignedDean: assignedDean || '',
      assignedFaculties: assignedFaculties || [],
    });

    await externalFaculty.save();

    return res.status(201).json({
      success: true,
      message: 'External faculty added successfully',
      data: {
        userId: externalFaculty.userId,
        full_name: externalFaculty.name,
        mail: externalFaculty.email,
        mob: externalFaculty.mobile,
        desg: externalFaculty.externalDesignation,
        specialization: externalFaculty.specialization,
        organization: externalFaculty.organization,
        address: externalFaculty.address,
        assignedDean: externalFaculty.assignedDean,
        assignedFaculties: externalFaculty.assignedFaculties,
      },
    });
  } catch (error: any) {
    console.error('Error creating external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Get all external faculty for a department
 * GET /api/hod/:department/get-externals
 */
export const getExternals = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;

    // Find all external faculty for this department
    const externals = await User.find({
      role: 'external',
      status: 'active',
      department: department
    }).select('userId name email mobile externalDesignation specialization organization address assignedDean assignedFaculties');

    // Format response to match frontend expectations
    const formattedExternals = externals.map((ext) => ({
      userId: ext.userId,
      full_name: ext.name,
      mail: ext.email,
      mob: ext.mobile,
      desg: (ext as any).externalDesignation || '',
      specialization: ext.specialization || '',
      organization: ext.organization || '',
      address: ext.address || '',
      assignedDean: (ext as any).assignedDean || '',
      assignedFaculties: (ext as any).assignedFaculties || [],
    }));

    return res.status(200).json({
      success: true,
      message: 'External faculty retrieved successfully',
      data: formattedExternals,
    });
  } catch (error: any) {
    console.error('Error fetching external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Delete external faculty
 * DELETE /api/interaction/:department/external/:userId
 */
export const deleteExternal = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;

    // Find and delete the external faculty
    const External = await User.findOne({
      userId: userId,
      role: 'external',
      status: 'active',
      department: department
    });

    if (!External) {
      return res.status(404).json({
        success: false,
        message: 'External faculty not found',
      });
    }
    External.status = 'inactive'; // Soft delete by marking as inactive
    await External.save();
    return res.status(200).json({
      success: true,
      message: 'External faculty removed successfully',
      data: {
        userId: External.userId,
        name: External.name,
      },
    });
  } catch (error: any) {
    console.error('Error deleting external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Assign dean to external faculty
 * PUT /api/interaction/:department/external/:userId/assign-dean
 */
export const assignDeanToExternal = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;
    const { deanUserId } = req.body;

    if (!deanUserId) {
      return res.status(400).json({
        success: false,
        message: 'Dean userId is required',
      });
    }

    // Check if dean exists in interaction deans collection
    const interactionDeanRecord = await InteractionDean.findOne({
      department: department,
      deanIds: deanUserId
    });

    if (!interactionDeanRecord) {
      return res.status(404).json({
        success: false,
        message: 'Dean not found in interaction deans for this department',
      });
    }

    // Verify dean exists, has dean role, and is active
    const dean = await User.findOne({
      userId: deanUserId,
      role: 'dean',
      status: 'active',
      department: department
    });

    if (!dean) {
      return res.status(404).json({
        success: false,
        message: 'Dean not found or inactive in this department',
      });
    }

    // Find and update external faculty
    const external = await User.findOne({
      userId: userId,
      role: 'external',
      status: 'active',
      department: department
    });

    if (!external) {
      return res.status(404).json({
        success: false,
        message: 'External faculty not found',
      });
    }

    external.assignedDean = deanUserId;
    await external.save();

    return res.status(200).json({
      success: true,
      message: 'Dean assigned successfully',
      data: {
        userId: external.userId,
        name: external.name,
        assignedDean: external.assignedDean,
      },
    });
  } catch (error: any) {
    console.error('Error assigning dean to external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Assign faculties to external faculty
 * PUT /api/interaction/:department/external/:userId/assign-faculties
 */
export const assignFacultiesToExternal = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;
    const { facultyUserIds } = req.body;

    if (!facultyUserIds || !Array.isArray(facultyUserIds)) {
      return res.status(400).json({
        success: false,
        message: 'Faculty userIds array is required',
      });
    }

    // Verify all faculties exist and have faculty role
    const faculties = await User.find({
      userId: { $in: facultyUserIds },
      role: 'faculty',
      status: 'active',
      department: department
    });

    if (faculties.length !== facultyUserIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Some faculties not found in this department',
      });
    }

    // Find and update external faculty
    const external = await User.findOne({
      userId: userId,
      role: 'external',
      status: 'active',
      department: department
    });

    if (!external) {
      return res.status(404).json({
        success: false,
        message: 'External faculty not found',
      });
    }

    external.assignedFaculties = facultyUserIds;
    await external.save();

    return res.status(200).json({
      success: true,
      message: 'Faculties assigned successfully',
      data: {
        userId: external.userId,
        name: external.name,
        assignedFaculties: external.assignedFaculties,
      },
    });
  } catch (error: any) {
    console.error('Error assigning faculties to external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Get all interaction deans for a department
 * GET /api/interaction/:department/interaction-deans
 */
export const getInteractionDeans = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;

    // Find interaction deans record for this department
    const interactionDeanRecord = await InteractionDean.findOne({
      department: department
    });

    if (!interactionDeanRecord || !interactionDeanRecord.deanIds.length) {
      return res.status(200).json({
        success: true,
        message: 'No interaction deans found for this department',
        data: [],
      });
    }

    // Get details of all interaction deans
    const interactionDeans = await User.find({
      userId: { $in: interactionDeanRecord.deanIds },
      role: 'dean',
      status: 'active',
      department: department
    }).select('userId name email department');

    const formattedDeans = interactionDeans.map((dean) => ({
      userId: dean.userId,
      name: dean.name,
      email: dean.email,
      department: dean.department,
    }));

    return res.status(200).json({
      success: true,
      message: 'Interaction deans retrieved successfully',
      data: formattedDeans,
    });
  } catch (error: any) {
    console.error('Error fetching interaction deans:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Toggle dean as interaction dean
 * PUT /api/interaction/:department/dean/:userId/toggle-interaction
 */
export const toggleInteractionDean = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;

    // Find the dean
    const dean = await User.findOne({
      userId: userId,
      role: 'dean',
      status: 'active',
      department: department
    });

    if (!dean) {
      return res.status(404).json({
        success: false,
        message: 'Dean not found in this department',
      });
    }

    // Find or create interaction dean record for department
    let interactionDeanRecord = await InteractionDean.findOne({ department });
    
    if (!interactionDeanRecord) {
      interactionDeanRecord = new InteractionDean({
        department,
        deanIds: []
      });
    }

    // Toggle dean in the deanIds array
    const deanIndex = interactionDeanRecord.deanIds.indexOf(userId);
    let isAdded = false;
    
    if (deanIndex > -1) {
      // Remove dean from interaction deans
      interactionDeanRecord.deanIds.splice(deanIndex, 1);
      isAdded = false;
    } else {
      // Add dean to interaction deans
      interactionDeanRecord.deanIds.push(userId);
      isAdded = true;
    }

    await interactionDeanRecord.save();

    return res.status(200).json({
      success: true,
      message: `Dean ${isAdded ? 'added to' : 'removed from'} interaction deans`,
      data: {
        userId: dean.userId,
        name: dean.name,
        isInteractionDean: isAdded,
      },
    });
  } catch (error: any) {
    console.error('Error toggling interaction dean status:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};
